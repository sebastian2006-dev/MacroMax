import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SHADOWS } from "@/src/theme/shadows";

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
}

export function BarcodeScannerModal({ visible, onClose, onScanned }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      if (permission && !permission.granted && permission.canAskAgain) {
        void requestPermission();
      }
    }
  }, [visible, permission, requestPermission]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-ink/90">
        <View className="mt-14 flex-row items-center justify-between px-5">
          <Text className="font-manrope-bold text-lg text-card">Scan Barcode</Text>
          <Pressable
            onPress={onClose}
            className="rounded-full bg-card/20 px-4 py-2"
            accessibilityLabel="Close scanner"
          >
            <Text className="font-manrope-semibold text-card">Close</Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-6">
          {!permission?.granted ? (
            <View className="items-center rounded-3xl bg-card p-6" style={SHADOWS.cardLg}>
              <Text className="font-manrope mb-3 text-center text-ink">
                Camera permission is required to scan EAN/UPC barcodes.
              </Text>
              <Pressable
                onPress={() => void requestPermission()}
                className="rounded-3xl bg-primary px-6 py-3"
              >
                <Text className="font-manrope-bold text-card">Grant Permission</Text>
              </Pressable>
            </View>
          ) : (
            <View className="h-72 w-full overflow-hidden rounded-3xl">
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
                onBarcodeScanned={({ data }) => {
                  if (scanned || !data) {
                    return;
                  }
                  setScanned(true);
                  onScanned(data);
                }}
              />
            </View>
          )}
        </View>

        <View className="pb-10">
          <Text className="font-manrope text-center text-sm text-card/70">
            Align the barcode inside the frame.
          </Text>
        </View>
      </View>
    </Modal>
  );
}
