import { StyleSheet, Text, View } from 'react-native';

export default function CaptureScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Capture</Text>
      <Text style={styles.body}>
        Chart capture flow placeholder. Camera, OCR, and SMC analysis will be
        wired here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
});
