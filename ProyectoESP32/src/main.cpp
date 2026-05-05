#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsServer.h>

const char* ssid = "NOMBRE_DE_TU_RED";
const char* password = "TU_CONTRASENA";

WebSocketsServer webSocket = WebSocketsServer(81);

// --- CONFIGURACIÓN DE SENSORES Y LED ---
const unsigned long HOLD_THRESHOLD = 300; 
const int TOUCH_LIMIT = 30; 

const int ledPin = 2; // Pin del LED integrado
int ledBrightness = 0;
unsigned long lastFadeTime = 0;

struct TouchPad {
  uint8_t pin;
  String id;
  bool isTouched;
  unsigned long touchStartTime;
  bool holdTriggered;
};

// D13 (Izquierda), D4 (Derecha), D32 (Acción)
TouchPad pads[3] = {
  {13, "PIN1", false, 0, false}, 
  {4,  "PIN2", false, 0, false}, 
  {32, "PIN3", false, 0, false}  
};

// --- FUNCIÓN PARA ESCUCHAR AL NAVEGADOR ---
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_TEXT) {
    String msg = (char*)payload;
    
    // Si el navegador nos grita "SCORE", subimos el brillo al máximo
    if (msg == "SCORE") {
      Serial.println("¡Punto anotado! Efecto LED activado.");
      ledBrightness = 255; 
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);

  Serial.print("Conectando a WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado. IP: ");
  Serial.println(WiFi.localIP());

  webSocket.begin();
  // Le decimos al WebSocket qué función usar cuando llegue un mensaje
  webSocket.onEvent(webSocketEvent);
  Serial.println("Servidor WebSocket iniciado");
}

void loop() {
  webSocket.loop();
  unsigned long currentMillis = millis();

  // --- LÓGICA DEL LED (Efecto de desvanecimiento PWM) ---
  if (ledBrightness > 0) {
    // Cada 5 milisegundos bajamos un poco el brillo
    if (currentMillis - lastFadeTime > 5) { 
      ledBrightness -= 2; // Velocidad de apagado
      if (ledBrightness < 0) ledBrightness = 0;
      
      // Aplicamos el brillo al LED 
      // (Nota: Si analogWrite marca error por tu versión de entorno, cámbialo a digitalWrite(ledPin, HIGH))
      analogWrite(ledPin, ledBrightness); 
      lastFadeTime = currentMillis;
    }
  } else {
      analogWrite(ledPin, 0); // Aseguramos que esté apagado
  }

  // --- LÓGICA DE SENSORES TOUCH ---
  for (int i = 0; i < 3; i++) {
    int touchValue = touchRead(pads[i].pin);

    if (touchValue < TOUCH_LIMIT) {
      if (!pads[i].isTouched) {
        pads[i].isTouched = true;
        pads[i].touchStartTime = currentMillis;
        pads[i].holdTriggered = false;
        
        String msg = pads[i].id + "_TOUCH";
        webSocket.broadcastTXT(msg);
      } 
      else if (!pads[i].holdTriggered && (currentMillis - pads[i].touchStartTime >= HOLD_THRESHOLD)) {
        pads[i].holdTriggered = true;
        
        String msg = pads[i].id + "_HOLD";
        webSocket.broadcastTXT(msg);
      }
    } 
    else {
      if (pads[i].isTouched) {
        pads[i].isTouched = false;
        
        String msg = pads[i].id + "_RELEASE";
        webSocket.broadcastTXT(msg);
      }
    }
  }

  delay(10);
}