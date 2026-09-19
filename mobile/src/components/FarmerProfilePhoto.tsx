import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Text as RNText } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../constants';
import { isUsableFarmerPhotoUrl } from '../../shared/src/farmerPhoto';
import { useConnectivityOnline } from '../hooks/useConnectivityOnline';

interface FarmerProfilePhotoProps {
  name: string;
  pictureUrl?: string | null;
  size?: 'large' | 'hero';
  /** Header layout: fills parent clip circle — parent must set size + overflow hidden. */
  variant?: 'default' | 'header';
  label?: string;
}

const OFFLINE_LOAD_FAIL = 'Photo unavailable offline';
const ONLINE_LOAD_FAIL = "Can't load photo";

/**
 * Shows the farmer's real verification photo, or a "photo required" placeholder.
 * If a URL exists but the image fails to load (e.g. offline / expired signed URL),
 * shows a calm in-circle fallback — never initials avatars.
 */
export function FarmerProfilePhoto({
  name,
  pictureUrl,
  size = 'large',
  variant = 'default',
  label = 'Verification photo required',
}: FarmerProfilePhotoProps) {
  const dim = size === 'hero' ? 140 : 100;
  const ring = size === 'hero' ? 4 : 3;
  const isHeader = variant === 'header';
  const hasPhotoUrl = isUsableFarmerPhotoUrl(pictureUrl);
  const online = useConnectivityOnline();
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [pictureUrl]);

  const showImage = hasPhotoUrl && !loadFailed;
  const showLoadFallback = hasPhotoUrl && loadFailed;
  const showMissingPlaceholder = !hasPhotoUrl;

  const failMessage = online === false ? OFFLINE_LOAD_FAIL : ONLINE_LOAD_FAIL;
  const failFontSize = size === 'hero' ? 11 : 9;
  const failLineHeight = size === 'hero' ? 14 : 11;
  const failPad = size === 'hero' ? 12 : 8;
  const circleRadius = dim / 2;
  const circleFrame = {
    width: isHeader ? '100%' as const : dim,
    height: isHeader ? '100%' as const : dim,
    borderRadius: isHeader ? undefined : circleRadius,
  };

  const inner = (
    <>
      {showImage ? (
        <Image
          source={{ uri: pictureUrl!.trim() }}
          style={[styles.fill, styles.photoImage, circleFrame, !isHeader ? { borderRadius: circleRadius } : null]}
          accessibilityLabel={`${name} verification photo`}
          onError={() => setLoadFailed(true)}
        />
      ) : null}

      {showLoadFallback ? (
        <View
          style={[
            styles.loadFail,
            styles.fill,
            circleFrame,
            !isHeader ? { borderRadius: circleRadius } : null,
            { paddingHorizontal: failPad },
          ]}
          accessibilityRole="text"
          accessibilityLabel={failMessage}
        >
          <Ionicons
            name="cloud-offline-outline"
            size={size === 'hero' ? 22 : 16}
            color={COLORS.primary}
            style={styles.loadFailIcon}
          />
          <RNText
            style={[
              styles.loadFailText,
              { fontSize: failFontSize, lineHeight: failLineHeight },
            ]}
            numberOfLines={3}
          >
            {failMessage}
          </RNText>
        </View>
      ) : null}

      {showMissingPlaceholder ? (
        <View
          style={[
            styles.fill,
            circleFrame,
            isHeader ? styles.headerPlaceholder : styles.placeholder,
            !isHeader ? { borderRadius: circleRadius } : null,
          ]}
        >
          <Ionicons
            name="camera-outline"
            size={size === 'hero' ? 40 : isHeader ? 28 : 32}
            color={isHeader ? COLORS.muted : COLORS.accent}
          />
          {isHeader ? (
            <RNText style={styles.headerPlaceholderText}>Photo required</RNText>
          ) : (
            <Text className="mt-1 text-center text-[10px] font-semibold text-[#D4AF6A]">
              Photo required
            </Text>
          )}
        </View>
      ) : null}
    </>
  );

  if (isHeader) {
    return <View style={styles.headerFill}>{inner}</View>;
  }

  return (
    <View
      style={[
        styles.wrap,
        { width: dim + ring * 2 + 8, height: dim + ring * 2 + 8 },
        size === 'hero' && !label ? styles.wrapCompact : null,
      ]}
    >
      <View
        style={[
          styles.ring,
          { padding: ring, borderRadius: (dim + ring * 2) / 2, overflow: 'hidden' },
        ]}
      >
        <View style={{ width: dim, height: dim, borderRadius: circleRadius, overflow: 'hidden' }}>
          {inner}
        </View>
      </View>
      {showMissingPlaceholder ? (
        <View style={styles.badge}>
          <Ionicons name="alert-circle" size={16} color={COLORS.alert} />
        </View>
      ) : null}
      {showMissingPlaceholder && size === 'hero' && label ? (
        <Text className="mt-2 text-center text-xs text-white/80">{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  wrapCompact: { marginBottom: 0 },
  ring: { backgroundColor: COLORS.accent },
  headerFill: {
    width: '100%',
    height: '100%',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  photoImage: {
    resizeMode: 'cover',
  },
  placeholder: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
  },
  headerPlaceholder: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPlaceholderText: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.muted,
    textAlign: 'center',
  },
  loadFail: {
    backgroundColor: '#E8F5F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadFailIcon: { marginBottom: 4 },
  loadFailText: {
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.alert,
  },
});
