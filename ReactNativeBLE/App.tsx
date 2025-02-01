import React, {useState, useEffect, useRef} from 'react';
import {
  TouchableOpacity,
  Button,
  PermissionsAndroid,
  NativeModules,
  Platform,
  View,
  Text,
  Alert,
  ScrollView
} from 'react-native';

import base64 from 'react-native-base64';

import {BleManager, Device} from 'react-native-ble-plx';
import {styles} from './styles/styles';

const BLTManager = new BleManager();

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
//const CHARACTERISTIC_UUID = 'beefcafe-36e1-4688-b7f5-00000000000b';
//const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

function App() {
  const [CHARACTERISTIC_UUID, setCHARACTERISTIC_UUID] = useState('beb5483e-36e1-4688-b7f5-ea07361b26a8');
  // Is a device connected?
  const [isConnected, setIsConnected] = useState(false);

  const [isScanning, setIsScanning] = useState(false);

  // What device is connected?
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  const [scannedDevices, setScannedDevices] = useState<Set<string>>(new Set());

  const [permissionStates, setPermissionStates] = useState<Set<string>>(new Set(["No permission state"]));

  const [message, setMessage] = useState('No Data Received');

  const [outgoingData, setOutgoingData] = useState('No Data Sent');

  const [log, setLog] = useState('No Log');

  const [error, setError] = useState('No Error');

  const [sentDataCount, setSentDataCount] = useState(1);

  const [servoAngle, setServoAngle] = useState(0);

  const [isServoIncreasing, setIsServoIncreasing] = useState(true);

  const permissions = [
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
  ];

  async function requestPermissions() {
    try {
      const granted = await PermissionsAndroid.requestMultiple(permissions);

      // Instead of that, filter function can be apply
      const allPermissionsGranted = Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );
      
      var updatedSet = new Set(permissionStates);

      if(updatedSet.has("No permission state")){
        updatedSet = new Set("");
      }

      Object.entries(granted).forEach(([permission, status]) => {
        console.log(`${permission}: ${status}`);
        const [part1, part2, permissionName] = permission.split('.');
        updatedSet.add(`${permissionName}: ${status}\n`);
        setPermissionStates(updatedSet);
      });

      if (!allPermissionsGranted) {
        console.warn('All permissions are required to proceed!');
        return false;
      }

      return true;
    } catch (err) {
      console.error('Permission request error:', err);
    }
  }

  async function checkPermissions() {
    try {
      // Check if all permissions are granted
      const granted = await Promise.all(
        permissions.map(permission =>
          PermissionsAndroid.check(permission)
        )
      );

      // If all permissions are granted, set hasPermission to true
      if (granted.every(status => status === true)) {
        return true;
      } else {
        
        return false;
      }
    } catch (err) {
      console.error('Permission check error:', err);
    }
  }

  const handleScan = () => {
    scanDevices(false);
  }

  const handleConnect = () => {
    scanDevices(true);
  }

  // Scans available BLT Devices and then call connectDevice
  async function scanDevices(withConnect: boolean) {
    setIsScanning(true);
    var isPermissionsAccepted = false;

    const checkedPermissions = await checkPermissions();
    const requestedPermissions = await requestPermissions();

    for(let i=0; i<5; i++){
      if(!isPermissionsAccepted){
        if(!(await checkPermissions())){
          if(await requestPermissions()){
            isPermissionsAccepted = true;
            break;
          }
        }else{
          isPermissionsAccepted = true;
          break;
        };
      }
    }
    setLog("Permission state is " + isPermissionsAccepted);
    if(withConnect){
      console.log('Connecting to ESP32...');
    }else{
      console.log('Scanning for devices...');
    }

    setScannedDevices(new Set());

    BLTManager.startDeviceScan(null, null, (error, scannedDevice) => {
      if (error) {
        console.error(error + "\n" + 'Error reason:', error.reason);

        setError(error.message);
        if(error.message === "BluetoothLE is powered off"){
          Alert.alert(
            'Bluetooth Is Off',
            'Please enable Bluetooth to scan for devices.',
            [
              { text: 'OK' }
              // TO DO buraya bluetoothu ayarlar kısmından açmak için ayarlara yönlendiren bir seçenek konabilir
            ]
          );
          return;
        }
        return;
      }

      if(scannedDevice){
        const deviceName = scannedDevice.name;
        if(deviceName !== null && deviceName !== undefined){
          setScannedDevices(prevSet => {
            if (!prevSet.has(deviceName)) {
              const updatedSet = new Set(prevSet);
              updatedSet.add(deviceName);
              console.log(`Found device: ${scannedDevice.name}`);
              return updatedSet;
            }
            return prevSet;
          });

          if (scannedDevice.name === 'ESP32' && withConnect) {
            console.log('ESP32 device found! Stopping scan and connecting...');
            stopScanning();
            connectDevice(scannedDevice);
          }
        }
      }
    });

    // Stop scanning devices after 5 seconds
    setTimeout(() => {
      stopScanning();
    }, 5000);
  }

  async function stopScanning(){
    BLTManager.stopDeviceScan();
    setIsScanning(false);
  }

  const handleSendCheckData = () => {
    sendDataToESP("Datake: " + sentDataCount);
    setSentDataCount(sentDataCount + 1);
  }

  const handleIncreaseServoAngle = () => {
    if(servoAngle < 180){
      const angleToSend = servoAngle + 15;
      setServoAngle(angleToSend);
      sendDataToESP("Servo: " + angleToSend);
    }
  }

  const handleDecreaseServoAngle = () => {
    if(servoAngle > 0){
      const angleToSend = servoAngle - 15;
      setServoAngle(angleToSend);
      sendDataToESP("Servo: " + angleToSend);
    }
  }

  async function sendDataToESP(value: string) {
    if(connectedDevice !== null && connectedDevice !== undefined){
      BLTManager.writeCharacteristicWithResponseForDevice(
        connectedDevice?.id,
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        base64.encode(value),
      ).then(characteristic => {
        if(characteristic.value !== null && characteristic.value !== undefined){
          setOutgoingData(value);
          console.log('Sended data :', base64.decode(characteristic.value));
        }
      });
    }
  }

  // Handle the device disconnection
  async function disconnectDevice() {
    console.log('Disconnecting from device...');
    if (connectedDevice) {
      const isDeviceConnected = await connectedDevice.isConnected();
      if (isDeviceConnected) {
        // İlgili transaction'ları iptal edebiliriz
        BLTManager.cancelTransaction('messagetransaction');
        // BLTManager.cancelTransaction('nightmodetransaction'); // Sizde varsa

        await BLTManager.cancelDeviceConnection(connectedDevice.id);
        console.log('Device disconnected');
      }

      // Bağlantı gerçekten koptu mu kontrol edelim
      const connectionStatus = await connectedDevice.isConnected();
      if (!connectionStatus) {
        setIsConnected(false);
        setConnectedDevice(null);
      }
    }
  }

  // Connect the device and start monitoring characteristics
  async function connectDevice(device: Device) {
    console.log('Connecting to Device:', device.name);

    try {
      const connected = await device.connect();
      console.log('Device connected:', connected.name);
      setConnectedDevice(connected);
      setIsConnected(true);
      
      BLTManager.stopDeviceScan();
      setIsScanning(false);

      await connected.discoverAllServicesAndCharacteristics();
      console.log('Services and characteristics discovered');

      // Eğer isterseniz tüm servisleri ve karakteristikleri görmek için:
      const services = await connected.services();
      for (const service of services) {
        console.log('Service UUID:', service.uuid);
        const characteristics = await service.characteristics();
        characteristics.forEach(c => {
          console.log('Characteristic UUID:', c.uuid);
        });
      }

      // Device disconnect event
      BLTManager.onDeviceDisconnected(device.id, (error, disconnectedDevice) => {
        console.log('Device Disconnected:', disconnectedDevice?.name || 'Unknown');
        setIsConnected(false);
        setConnectedDevice(null);
      });

      // Başlangıçtaki ilk read
      const initialCharacteristic = await connected.readCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
      );
      if (initialCharacteristic?.value) {
        const decoded = base64.decode(initialCharacteristic.value);
        setMessage(decoded);
        console.log('Initial read value:', decoded);
      }

      // Sonrasında güncellemeleri dinlemek
      connected.monitorCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            if(error.message.includes("disconnected") || error.message.includes("cancelled")){
              console.log('Monitor info:', error);
              setLog(error.message);
            }else{
              console.error('Monitor error:', error);
              setError(error.message);
            }
            return;
          }
          if (characteristic?.value) {
            const decodedVal = base64.decode(characteristic.value);
            console.log('Notification value (base64):', characteristic.value);
            console.log('Notification value (decoded):', decodedVal);
            setMessage(decodedVal);
          }
        },
        'messagetransaction',
      );
    } catch (err) {
      console.error('Connection error:', err);
    }
  }

  const handleChangeCharacteristic = () => {
    if(CHARACTERISTIC_UUID === 'beb5483e-36e1-4688-b7f5-ea07361b26a8'){
      setCHARACTERISTIC_UUID('beefcafe-36e1-4688-b7f5-00000000000b');
    }else{
      setCHARACTERISTIC_UUID('beb5483e-36e1-4688-b7f5-ea07361b26a8');
    }
  
    const log = "Characteristic UUID changed to : " + CHARACTERISTIC_UUID;
    console.log(log);
    setLog(log);
  }

  return (
    <View style={{flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 75}}>
      {/* Title */}
      <View style={styles.rowView}>
        <Text style={styles.titleText}>BLE Sample</Text>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic">
        <View style={{flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 25}}>
          {/* Connect / Disconnect Button */}
          <View style={styles.rowView}>
            <TouchableOpacity style={{width: 120}}>
              {!isConnected ? (
                <Button
                  title="Connect to ESP32"
                  onPress={handleConnect}
                  disabled={false}
                />
              ) : (
                <Button
                  title="Disconnect"
                  onPress={disconnectDevice}
                  disabled={false}
                />
              )}
            </TouchableOpacity>
          </View>
          
          <View style={{ padding: 10 }} />
              
          <View style={styles.rowView}>
            <TouchableOpacity style={{ width: 120 }}>
              <Button
                title="Change Characteristic"
                onPress={handleChangeCharacteristic}
                disabled={false} />
            </TouchableOpacity>
          </View>

          {isConnected ? (
            <>
              <View style={{ padding: 10 }} />
              
              <View style={styles.rowView}>
                <TouchableOpacity style={{ width: 120 }}>
                  <Button
                    title="Increase Servo Angle"
                    onPress={handleIncreaseServoAngle}
                    disabled={false} />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 10 }} />
              
              <View style={styles.rowView}>
                <TouchableOpacity style={{ width: 120 }}>
                  <Button
                    title="Decrease Servo Angle"
                    onPress={handleDecreaseServoAngle}
                    disabled={false} />
                </TouchableOpacity>
              </View>
            </>
            ) : (null)}

          <View style={{padding: 10}} />

          <View style={styles.rowView}>
            <TouchableOpacity style={{width: 120}}>
                <Button
                  title="Send Data"
                  onPress={handleSendCheckData}
                  disabled={false}
                />
            </TouchableOpacity>
          </View>

          <View style={{padding: 5}} />

          {/* Monitored Value */}
          <View style={styles.rowView}>
            <Text style={styles.subTitleText}>Outgoing Data:</Text>
          </View>
          <View style={styles.rowView}>
            <Text style={styles.baseText}>{outgoingData}</Text>
          </View>
          
          <View style={{padding: 5}} />

          <View style={styles.rowView}>
            <Text style={styles.subTitleText}>Incoming Data:</Text>
          </View>
          <View style={styles.rowView}>
            <Text style={styles.baseText}>{message}</Text>
          </View>
          <View style={{padding: 5}} />
          <View style={styles.rowView}>
            <Text style={styles.subTitleText}>Permission States:</Text>
          </View>
          <View style={styles.rowView}>
            <Text style={styles.baseText}>{permissionStates}</Text>
          </View>
          <View style={{padding: 5}} />
          <View style={styles.rowView}>
            <Text style={styles.subTitleText}>Logs:</Text>
          </View>
          <View style={styles.rowView}>
            <Text style={styles.baseText}>{log}</Text>
          </View>
          <View style={{padding: 5}} />
          <View style={styles.rowView}>
            <Text style={styles.subTitleText}>Errors:</Text>
          </View>
          <View style={styles.rowView}>
            <Text style={styles.baseText}>{error}</Text>
          </View>
          
          <View style={{padding: 10}} />
          
          <View style={styles.rowView}>
            <TouchableOpacity style={{width: 120}}>
            {!isScanning ? (
              <Button
                title="Scan Devices"
                onPress={handleScan}
                disabled={false}
              /> 
              ) : (
                <Button
                  title="Stop Scanning Devices"
                  onPress={stopScanning}
                  disabled={false}
                />
            )}
            </TouchableOpacity>
          </View>

          <View style={{padding: 10}} />

          <View style={styles.rowView}>
            <Text style={styles.titleText}>Scanned Devices:</Text>
          </View>
          {Array.from(scannedDevices).map((deviceName, index) => (
            <Text key={index} style={styles.baseText}>{deviceName}</Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export default App;
