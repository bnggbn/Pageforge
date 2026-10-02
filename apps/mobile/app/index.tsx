import { View, Text } from 'react-native'
import { StatusBar } from 'expo-status-bar'

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-3xl font-bold text-text mb-2">Pageforge</Text>
      <Text className="text-base text-text-muted">Document Platform — Mobile</Text>
      <StatusBar style="auto" />
    </View>
  )
}
