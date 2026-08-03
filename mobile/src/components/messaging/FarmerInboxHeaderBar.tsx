import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MessagesNotificationsHeaderIcons } from './MessagesNotificationsHeaderIcons';

type Props = {
  variant?: 'light' | 'dark';
};

/** Top-right inbox icons for farmer tab screens (not on bottom nav). */
export function FarmerInboxHeaderBar({ variant = 'light' }: Props) {
  const iconColor = variant === 'dark' ? '#fff' : '#1A4D3E';
  return (
    <View style={styles.bar}>
      <MessagesNotificationsHeaderIcons iconColor={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
});
