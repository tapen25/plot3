document.getElementById("connect").addEventListener("click", async () => {
  try {
    // Heart Rate Service UUID
    const serviceUuid = "heart_rate";
    const characteristicUuid = "heart_rate_measurement";

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [serviceUuid] }]
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid);

    characteristic.startNotifications();
    characteristic.addEventListener("characteristicvaluechanged", (event) => {
      const value = event.target.value;
      const bpm = value.getUint8(1); // 心拍数は2バイト目
      document.getElementById("bpm").textContent = bpm + " bpm";
    });
  } catch (error) {
    console.error(error);
  }
});
