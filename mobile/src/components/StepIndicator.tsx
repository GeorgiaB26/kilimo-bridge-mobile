import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
}

export function StepIndicator({ currentStep, totalSteps, labels }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i <= currentStep && styles.dotActive,
              i < currentStep && styles.dotComplete,
            ]}
          />
        ))}
      </View>
      {labels && labels[currentStep] ? (
        <Text style={styles.label}>
          Step {currentStep + 1} of {totalSteps}: {labels[currentStep]}
        </Text>
      ) : (
        <Text style={styles.label}>
          Step {currentStep + 1} of {totalSteps}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.accent,
    width: 24,
  },
  dotComplete: {
    backgroundColor: COLORS.success,
  },
  label: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },
});
