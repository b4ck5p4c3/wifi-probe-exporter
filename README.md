# wifi-probe-exporter

Wi-Fi connection tester and Prometheus exporter

## Used software
- `wpa_supplicant`
- `dhcpd`

## Configuration

`GET /metrics` - get Wi-Fi metrics

`.env` variables:
- `CONFIG_FILE` - exporter config file, example can be seen in `config.json.example`
- `PORT` - port to listen onto
- `INTERVAL` - polling interval
- `WIFI_CONNECT_TIMEOUT` - timeout for Wi-Fi connection (`wpa_supplicant`)
- `DHCP_RETRIEVAL_TIMEOUT` - timeout for DHCP retrieval (`dhcpd`)
- `PING_TIMEOUT` - timeout for host ping