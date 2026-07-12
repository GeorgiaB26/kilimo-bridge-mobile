import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Card } from 'react-native-paper';
import { COLORS } from '../../constants';

interface KBCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  elevated?: boolean;
}

export function KBCard({ children, style, onPress, elevated = true }: KBCardProps) {
  return (
    <Card
      mode={elevated ? 'elevated' : 'outlined'}
      style={[styles.card, style]}
      onPress={onPress}
    >
      <Card.Content style={styles.content}>{children}</Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    overflow: 'visible',
  },
  content: {
    paddingTop: 16,
    paddingBottom: 22,
    paddingHorizontal: 16,
  },
});
