#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# Panel Server for iPad Mini 1 - iOS 9.3.5
# Python 2.5 compatible
#
# Minimal HTTP server that receives commands from Home Assistant
# and controls the iPad screen via Activator.
#
# Endpoints:
#   GET /wake  - Wakes up the screen
#   GET /sleep - Locks the screen
#   GET /ping  - Health check
#   GET /open  - Opens Tileboard in Safari
#
# Usage:
#   python /var/root/panel/server.py
#
# Install as daemon:
#   Copy com.panel.server.plist to /Library/LaunchDaemons/
#   launchctl load /Library/LaunchDaemons/com.panel.server.plist

import SocketServer
import os
import sys
import time

PORT = 9090

# ============================================================
# CONFIGURATION - Edit the URL below with your Tileboard address
# ============================================================
TILEBOARD_URL = "http://YOUR-HA:8123/tileboard"
# ============================================================

def run_activator(action):
    os.system("/usr/bin/activator send " + action)

class PanelHandler(SocketServer.StreamRequestHandler):
    def handle(self):
        try:
            line = self.rfile.readline()
            if not line:
                return

            parts = line.strip().split(" ")
            if len(parts) < 2:
                return

            path = parts[1]

            while True:
                header = self.rfile.readline()
                if not header or header.strip() == "":
                    break

            code = "200 OK"
            body = ""

            if path == "/wake":
                run_activator("libactivator.system.homebutton")
                time.sleep(0.5)
                run_activator("libactivator.lockscreen.dismiss")
                body = '{"status":"awake"}'

            elif path == "/sleep":
                run_activator("libactivator.lockscreen.show")
                body = '{"status":"sleeping"}'

            elif path == "/ping":
                body = '{"status":"alive"}'

            elif path == "/open":
                os.system('uiopen "' + TILEBOARD_URL + '"')
                body = '{"status":"opened"}'

            else:
                code = "404 Not Found"
                body = '{"error":"unknown"}'

            response = "HTTP/1.1 " + code + "\r\n"
            response = response + "Content-Type: application/json\r\n"
            response = response + "Content-Length: " + str(len(body)) + "\r\n"
            response = response + "Connection: close\r\n"
            response = response + "\r\n"
            response = response + body

            self.wfile.write(response)

        except Exception:
            pass

class ReusableTCPServer(SocketServer.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    try:
        server = ReusableTCPServer(("0.0.0.0", PORT), PanelHandler)
        sys.stdout.write("[Panel Server] Port " + str(PORT) + " OK\n")
        sys.stdout.flush()
        server.serve_forever()
    except Exception:
        sys.stderr.write("[Panel Server] Failed to start\n")
        sys.stderr.flush()
        sys.exit(1)
