/*
 * TileBoard Alarm Keypad Dashboard
 * Dedicated alarm keypad for wall-mounted iPad Mini 1 (1024x768)
 * Entity: alarm_control_panel.alarmo
 */

var ALARM_ENTITY_ID = 'alarm_control_panel.alarmo';
var PIN_MAX_LENGTH = 4;

var CONFIG = {
  customTheme: CUSTOM_THEMES.HOMEKIT,
  transition: TRANSITIONS.NONE,
  entitySize: ENTITY_SIZES.NORMAL,
  tileSize: 100,
  tileMargin: 0,
  serverUrl: 'http://' + location.hostname + ':8123',
  wsUrl: 'ws://' + location.hostname + ':8123/api/websocket',
  authToken: window.HA_AUTH_TOKEN || '',
  groupsAlign: GROUP_ALIGNS.HORIZONTALLY,
  pingConnection: true,
  locale: 'en',
  timeFormat: 24,
  header: {
    styles: {
      margin: '0',
      padding: '0',
      fontSize: '0',
    },
    left: [],
    right: [],
  },
  pages: [
    {
      groups: [
        {
          items: [
            {
              position: [0, 0],
              type: TYPES.ALARM,
              id: ALARM_ENTITY_ID,
              title: '',
              icons: {
                arming: 'mdi-bell-outline',
                disarmed: 'mdi-shield-lock-open',
                pending: 'mdi-bell',
                armed_home: 'mdi-shield-home',
                armed_away: 'mdi-shield-lock',
                triggered: 'mdi-bell-ring',
              },
              states: {
                arming: 'Arming',
                disarmed: 'Disarmed',
                pending: 'Pending',
                armed_home: 'Home',
                armed_away: 'Armed',
                triggered: 'Triggered',
              },
            },
          ],
        },
      ],
    },
  ],

  onReady: function () {
    var ctx = this;
    initAlarmKeypad(ctx);
  },
};


/* =====================================================================
 *  ALARM KEYPAD — Pure vanilla JS, ES5, no dependencies
 * ===================================================================== */

function initAlarmKeypad(ctx) {
  var pinCode = '';
  var currentState = 'unknown';
  var feedbackTimer = null;

  // --- State labels ---
  var STATE_LABELS = {
    disarmed: 'DISARMED',
    armed_home: 'HOME',
    armed_away: 'ARMED',
    armed_night: 'NIGHT',
    arming: 'ARMING...',
    pending: 'PENDING',
    triggered: 'TRIGGERED!',
    unknown: '...',
  };

  var STATE_CLASSES = {
    disarmed: 'ak-state-disarmed',
    armed_home: 'ak-state-armed',
    armed_away: 'ak-state-armed',
    armed_night: 'ak-state-armed',
    arming: 'ak-state-arming',
    pending: 'ak-state-arming',
    triggered: 'ak-state-triggered',
    unknown: 'ak-state-unknown',
  };

  // --- Build DOM ---
  var root = document.createElement('div');
  root.id = 'alarm-keypad';
  root.innerHTML = buildKeypadHTML();
  document.body.appendChild(root);

  // --- Cache elements ---
  var elStatus = document.getElementById('ak-status');
  var elStatusIcon = document.getElementById('ak-status-icon');
  var elPinDisplay = document.getElementById('ak-pin-display');
  var elFeedback = document.getElementById('ak-feedback');
  var buttons = root.querySelectorAll('[data-digit]');
  var actionButtons = root.querySelectorAll('[data-action]');
  var clearBtn = document.getElementById('ak-clear');
  var armBtns = root.querySelectorAll('[data-action="arm_home"], [data-action="arm_away"]');
  var disarmBtn = root.querySelector('[data-action="disarm"]');

  // --- Attach event listeners ---
  for (var i = 0; i < buttons.length; i++) {
    (function (btn) {
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        onDigitPress(btn.getAttribute('data-digit'));
        btn.classList.add('ak-btn-active');
      }, false);
      btn.addEventListener('touchend', function () {
        btn.classList.remove('ak-btn-active');
      }, false);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        onDigitPress(btn.getAttribute('data-digit'));
      }, false);
    })(buttons[i]);
  }

  for (var j = 0; j < actionButtons.length; j++) {
    (function (btn) {
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        onAction(btn.getAttribute('data-action'));
        btn.classList.add('ak-btn-active');
      }, false);
      btn.addEventListener('touchend', function () {
        btn.classList.remove('ak-btn-active');
      }, false);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        onAction(btn.getAttribute('data-action'));
      }, false);
    })(actionButtons[j]);
  }

  clearBtn.addEventListener('touchstart', function (e) {
    e.preventDefault();
    onClear();
    clearBtn.classList.add('ak-btn-active');
  }, false);
  clearBtn.addEventListener('touchend', function () {
    clearBtn.classList.remove('ak-btn-active');
  }, false);
  clearBtn.addEventListener('click', function (e) {
    e.preventDefault();
    onClear();
  }, false);

  // --- State polling (every 5s, with cleanup on unload) ---
  var pollTimer = setInterval(function () {
    try {
      var entity = ctx.states[ALARM_ENTITY_ID];
      if (entity && entity.state !== currentState) {
        currentState = entity.state;
        updateStatusDisplay();
      }
    } catch (e) {
      // Prevent polling errors from crashing the page
    }
  }, 5000);

  // Cleanup on page unload to free memory
  window.addEventListener('beforeunload', function () {
    clearInterval(pollTimer);
    if (feedbackTimer) clearTimeout(feedbackTimer);
  }, false);

  // --- Initial state ---
  var initEntity = ctx.states[ALARM_ENTITY_ID];
  if (initEntity) {
    currentState = initEntity.state;
  }
  updateStatusDisplay();
  updatePinDisplay();

  // --- Handlers ---

  function onDigitPress(digit) {
    if (pinCode.length >= PIN_MAX_LENGTH) return;
    pinCode += digit;
    updatePinDisplay();
  }

  function onClear() {
    pinCode = '';
    updatePinDisplay();
    showFeedback('');
  }

  function onAction(action) {
    var serviceMap = {
      arm_home: 'alarm_arm_home',
      arm_away: 'alarm_arm_away',
      disarm: 'alarm_disarm',
    };

    var service = serviceMap[action];
    if (!service) return;

    var data = { entity_id: ALARM_ENTITY_ID };
    if (pinCode.length > 0) {
      data.code = pinCode;
    }

    showFeedback('Sending...');

    // Timeout safety: clear feedback if API never responds
    var apiTimeout = setTimeout(function () {
      showFeedback('Error');
      setTimeout(function () { showFeedback(''); }, 2000);
    }, 10000);

    try {
      ctx.api.callService('alarm_control_panel', service, data, function () {
        clearTimeout(apiTimeout);
        pinCode = '';
        updatePinDisplay();
        showFeedback('');
      });
    } catch (e) {
      clearTimeout(apiTimeout);
      showFeedback('Error');
      setTimeout(function () { showFeedback(''); }, 2000);
    }
  }

  // --- Display updates ---

  function updateStatusDisplay() {
    var label = STATE_LABELS[currentState] || currentState.toUpperCase();
    var cls = STATE_CLASSES[currentState] || 'ak-state-unknown';

    elStatus.textContent = label;
    elStatus.className = 'ak-status ' + cls;

    // Icon
    var icons = {
      disarmed: 'mdi-shield-lock-open-outline',
      armed_home: 'mdi-shield-home',
      armed_away: 'mdi-shield-lock',
      armed_night: 'mdi-shield-moon-full',
      arming: 'mdi-shield-outline',
      pending: 'mdi-shield-alert',
      triggered: 'mdi-shield-alert',
    };
    var icon = icons[currentState] || 'mdi-shield-outline';
    elStatusIcon.className = 'mdi ' + icon + ' ak-status-icon ' + cls;

    // Update action button visibility (use cached elements)
    var isDisarmed = currentState === 'disarmed';

    for (var i = 0; i < armBtns.length; i++) {
      armBtns[i].style.display = isDisarmed ? '' : 'none';
    }
    if (disarmBtn) {
      disarmBtn.style.display = isDisarmed ? 'none' : '';
    }
  }

  function updatePinDisplay() {
    var dots = '';
    for (var i = 0; i < PIN_MAX_LENGTH; i++) {
      if (i < pinCode.length) {
        dots += '<span class="ak-dot ak-dot-filled"></span>';
      } else {
        dots += '<span class="ak-dot"></span>';
      }
    }
    elPinDisplay.innerHTML = dots;
  }

  function showFeedback(msg) {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    elFeedback.textContent = msg;
    if (msg) {
      feedbackTimer = setTimeout(function () {
        elFeedback.textContent = '';
      }, 3000);
    }
  }
}


/* =====================================================================
 *  HTML Builder
 * ===================================================================== */

function buildKeypadHTML() {
  return ''
    + '<div class="ak-container">'

    // Status area
    + '  <div class="ak-status-area">'
    + '    <i id="ak-status-icon" class="mdi mdi-shield-outline ak-status-icon"></i>'
    + '    <div id="ak-status" class="ak-status ak-state-unknown">...</div>'
    + '  </div>'

    // PIN display
    + '  <div class="ak-pin-area">'
    + '    <div id="ak-pin-display" class="ak-pin-display"></div>'
    + '    <div id="ak-feedback" class="ak-feedback"></div>'
    + '  </div>'

    // Keypad
    + '  <div class="ak-keypad">'
    + '    <div class="ak-keypad-row">'
    + '      <button class="ak-btn ak-btn-digit" data-digit="1">1</button>'
    + '      <button class="ak-btn ak-btn-digit" data-digit="2">2</button>'
    + '      <button class="ak-btn ak-btn-digit" data-digit="3">3</button>'
    + '    </div>'
    + '    <div class="ak-keypad-row">'
    + '      <button class="ak-btn ak-btn-digit" data-digit="4">4</button>'
    + '      <button class="ak-btn ak-btn-digit" data-digit="5">5</button>'
    + '      <button class="ak-btn ak-btn-digit" data-digit="6">6</button>'
    + '    </div>'
    + '    <div class="ak-keypad-row">'
    + '      <button class="ak-btn ak-btn-digit" data-digit="7">7</button>'
    + '      <button class="ak-btn ak-btn-digit" data-digit="8">8</button>'
    + '      <button class="ak-btn ak-btn-digit" data-digit="9">9</button>'
    + '    </div>'
    + '    <div class="ak-keypad-row ak-keypad-row-bottom">'
    + '      <button class="ak-btn ak-btn-digit ak-btn-zero" data-digit="0">0</button>'
    + '    </div>'
    + '  </div>'

    // Action buttons
    + '  <div class="ak-actions">'
    + '    <button class="ak-btn ak-btn-action ak-btn-arm-home" data-action="arm_home">HOME</button>'
    + '    <button class="ak-btn ak-btn-action ak-btn-arm-away" data-action="arm_away">ARM</button>'
    + '    <button class="ak-btn ak-btn-action ak-btn-disarm" data-action="disarm">DISARM</button>'
    + '    <button class="ak-btn ak-btn-action ak-btn-clear" id="ak-clear">CLEAR</button>'
    + '  </div>'

    + '</div>';
}
