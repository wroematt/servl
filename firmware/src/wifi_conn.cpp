#include "wifi_conn.h"
#include <WiFi.h>

// Last-known credentials, stored so wifi_maintain() can reconnect.
static char s_ssid[64]  = {};
static char s_pass[128] = {};
static uint32_t s_reconnectAt = 0;

bool wifi_connect(const char* ssid, const char* pass, uint32_t timeout_ms) {
    strlcpy(s_ssid, ssid, sizeof(s_ssid));
    strlcpy(s_pass, pass, sizeof(s_pass));

    log_i("[wifi] Connecting to SSID: %s", ssid);
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, pass);

    uint32_t deadline = millis() + timeout_ms;
    while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
        delay(200);
    }

    if (WiFi.status() == WL_CONNECTED) {
        log_i("[wifi] Connected — IP: %s", WiFi.localIP().toString().c_str());
        return true;
    }

    log_e("[wifi] Connection timed out");
    WiFi.disconnect(true);
    return false;
}

bool wifi_is_connected() {
    return WiFi.status() == WL_CONNECTED;
}

void wifi_maintain() {
    if (WiFi.status() == WL_CONNECTED) {
        s_reconnectAt = 0;
        return;
    }

    // Back off 5 s between reconnect attempts.
    if (s_reconnectAt == 0 || millis() >= s_reconnectAt) {
        log_w("[wifi] Lost connection — retrying...");
        WiFi.disconnect(false);
        WiFi.begin(s_ssid, s_pass);
        s_reconnectAt = millis() + 5000;
    }
}
