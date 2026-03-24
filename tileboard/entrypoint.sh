#!/bin/sh
# Inject secrets.js before config.js in TileBoard's index.html
sed -i 's|<script src="config.js"|<script src="secrets.js"></script><script src="config.js"|' /usr/share/nginx/html/index.html
exec nginx -g 'daemon off;'
