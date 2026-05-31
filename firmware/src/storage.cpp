#include "storage.h"
#include <Preferences.h>

// NVS namespace — all credential keys live under this name.
static const char* NVS_NS = "servl";

bool storage_has_credentials() {
    Preferences prefs;
    prefs.begin(NVS_NS, /*readOnly=*/true);
    bool has = prefs.isKey("ssid") && prefs.isKey("broker") && prefs.isKey("client_id");
    prefs.end();
    return has;
}

void storage_save(const Credentials& c) {
    Preferences prefs;
    prefs.begin(NVS_NS, /*readOnly=*/false);
    prefs.putString("ssid",      c.ssid);
    prefs.putString("wifipass",  c.wifi_pass);
    prefs.putString("broker",    c.mqtt_broker);
    prefs.putInt   ("port",      c.mqtt_port);
    prefs.putString("client_id", c.mqtt_client_id);
    prefs.putString("mqttuser",  c.mqtt_user);
    prefs.putString("mqttpass",  c.mqtt_pass);
    prefs.end();
    log_i("[storage] Credentials saved for broker %s", c.mqtt_broker);
}

Credentials storage_load() {
    Credentials c{};
    Preferences prefs;
    prefs.begin(NVS_NS, /*readOnly=*/true);

    String ssid      = prefs.getString("ssid",      "");
    String wifipass  = prefs.getString("wifipass",  "");
    String broker    = prefs.getString("broker",    "");
    int    port      = prefs.getInt   ("port",      1883);
    String clientId  = prefs.getString("client_id", "");
    String mqttuser  = prefs.getString("mqttuser",  "");
    String mqttpass  = prefs.getString("mqttpass",  "");

    prefs.end();

    strlcpy(c.ssid,           ssid.c_str(),     sizeof(c.ssid));
    strlcpy(c.wifi_pass,      wifipass.c_str(), sizeof(c.wifi_pass));
    strlcpy(c.mqtt_broker,    broker.c_str(),   sizeof(c.mqtt_broker));
    c.mqtt_port = port;
    strlcpy(c.mqtt_client_id, clientId.c_str(), sizeof(c.mqtt_client_id));
    strlcpy(c.mqtt_user,      mqttuser.c_str(), sizeof(c.mqtt_user));
    strlcpy(c.mqtt_pass,      mqttpass.c_str(), sizeof(c.mqtt_pass));

    return c;
}

void storage_clear() {
    Preferences prefs;
    prefs.begin(NVS_NS, /*readOnly=*/false);
    prefs.clear();
    prefs.end();
    log_i("[storage] Credentials erased");
}
