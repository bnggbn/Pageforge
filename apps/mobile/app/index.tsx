import { View, Text } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { FORMAT_LABELS } from '@pageforge/domain'

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-3xl font-bold text-text mb-2">Pageforge</Text>
      <Text className="text-base text-text-muted">Document Platform — Mobile</Text>
      <Text className="text-sm text-text-muted mt-4">
        文件格式：{Object.values(FORMAT_LABELS).join(' / ')}
      </Text>
      <StatusBar style="auto" />
    </View>
  )
}
