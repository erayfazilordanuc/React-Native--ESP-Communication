/*
  Based on Neil Kolban example for IDF: https://github.com/nkolban/esp32-snippets/blob/master/cpp_utils/tests/BLE%20Tests/SampleNotify.cpp
  Ported to Arduino ESP32 by Evandro Copercini
  updated by chegewara and MoThunderz
*/
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <HardwareSerial.h>
#include <ESP32Servo.h>

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
BLEDescriptor *pDescr;
BLE2902 *pBLE2902;

bool deviceConnected = false;
bool oldDeviceConnected = false;
bool isSelamIsGiven = false;

// See the following for generating UUIDs:
// https://www.uuidgenerator.net/

std::string incomingData = "";

Servo servoMain;
Servo servo1;

int servoMainPin = 5;
int servo1Pin = 18;

int ledPin = 2;

// #define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beefcafe-36e1-4688-b7f5-00000000000b"
// #define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

class MyServerCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer *pServer)
  {
    if(!deviceConnected){
      deviceConnected = true;
      Serial.println("Connected");
    }
  };

  void onDisconnect(BLEServer *pServer)
  {
    if(deviceConnected){
      deviceConnected = false;
      Serial.println("Disconnected");
    }
  }
};

class CharacteristicsCallbacks : public BLECharacteristicCallbacks
{
  void onWrite(BLECharacteristic *pCharacteristic)
  {
    incomingData = pCharacteristic->getValue().c_str();

    // Şu anda tek servo açısı geliyor, özelleştirme ile her servoya ayrı açı gönderilmeli
    if(incomingData.find("Servo") != std::string::npos){
      size_t colonPos = incomingData.find(":");

      int servoAngle;

      if (colonPos != std::string::npos) {
        std::string valuePart = incomingData.substr(colonPos + 1);
        valuePart.erase(0, valuePart.find_first_not_of(" "));

        servoAngle = std::stoi(valuePart);

        Serial.println(servoAngle);

        servoMain.write(servoAngle);
        servo1.write(servoAngle);

        digitalWrite(ledPin, 1);
        delay(100);
        digitalWrite(ledPin, 0);
      }
    }


    Serial.print("Incoming Data: ");
    Serial.println(incomingData.c_str());
  }
};

void setup() {
  // Serial.begin(115200);
  Serial.begin(9600);

  servoMain.attach(servoMainPin);
  servo1.attach(servo1Pin);

  servoMain.write(0);
  servo1.write(0);

  delay(500);

  servoMain.write(180);
  servo1.write(180);

  delay(500);
  
  servoMain.write(0);
  servo1.write(0);

  delay(1000);

  pinMode(ledPin, OUTPUT);

  // Create the BLE Device
  BLEDevice::init("ESP32");

  // Create the BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create the BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create a BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_NOTIFY |
                      BLECharacteristic::PROPERTY_INDICATE
                    );                   

  // Create a BLE Descriptor
  
  pDescr = new BLEDescriptor((uint16_t)0x2901);
  pDescr->setValue("A very interesting variable");
  pCharacteristic->addDescriptor(pDescr);
  
  pBLE2902 = new BLE2902();
  pBLE2902->setNotifications(true);
  pCharacteristic->addDescriptor(pBLE2902);

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);  // set value to 0x00 to not advertise this parameter
  BLEDevice::startAdvertising();
  Serial.println("\nWaiting a client connection to notify...");

  pCharacteristic->setCallbacks(new CharacteristicsCallbacks());
}

void loop() {
    // notify changed value
    if (deviceConnected) {
        // pCharacteristic->setValue(value);
        // pCharacteristic->notify();
        // value++;
        if(!isSelamIsGiven){
          std::string message = "Selamun Aleykum";
          pCharacteristic->setValue(message);
          pCharacteristic->notify();
          isSelamIsGiven = true;
        }else{
          std::string message = "Aleykum Selam";
          pCharacteristic->setValue(message);
          pCharacteristic->notify();
          isSelamIsGiven = false;
        }
        delay(2000);
    }
    // disconnecting
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); // give the bluetooth stack the chance to get things ready
        pServer->startAdvertising(); // restart advertising
        Serial.println("start advertising");
        oldDeviceConnected = deviceConnected;
    }
    // connecting
    if (deviceConnected && !oldDeviceConnected) {
        // do stuff here on connecting
        oldDeviceConnected = deviceConnected;
    }
}