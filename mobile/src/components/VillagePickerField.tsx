import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from './FormField';
import { PickerField } from './PickerField';
import { fetchVerifiedVillages } from '../api/client';

type Props = {
  country: string;
  district: string;
  subCounty: string;
  parish?: string;
  village?: string;
  labels: string[];
  level3Required: boolean;
  persistHint: string;
  onChange: (village: string) => void;
};

export function VillagePickerField({
  country,
  district,
  subCounty,
  parish,
  village,
  labels,
  level3Required,
  persistHint,
  onChange,
}: Props) {
  const [verifiedVillages, setVerifiedVillages] = useState<string[]>([]);
  const [addingVillage, setAddingVillage] = useState(false);
  const [villageDraft, setVillageDraft] = useState('');

  const villagePathReady = Boolean(
    country && district && subCounty && (!level3Required || parish)
  );

  useEffect(() => {
    if (!village) {
      setAddingVillage(false);
      setVillageDraft('');
    }
  }, [village]);

  useEffect(() => {
    if (!villagePathReady) {
      setVerifiedVillages([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      fetchVerifiedVillages({
        country,
        level1: district,
        level2: subCounty,
        level3: parish?.trim() || undefined,
      })
        .then((villages) => {
          if (!cancelled) setVerifiedVillages(villages);
        })
        .catch(() => {
          if (!cancelled) setVerifiedVillages([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [villagePathReady, country, district, subCounty, parish]);

  const villageOptions = useMemo(() => {
    const names = [...verifiedVillages];
    const current = village?.trim();
    if (current && !names.some((n) => n.toLowerCase() === current.toLowerCase())) {
      names.push(current);
    }
    return names;
  }, [verifiedVillages, village]);

  const applyVillage = (next: string) => {
    const name = next.trim();
    if (!name) return;
    const canonical = verifiedVillages.find((n) => n.toLowerCase() === name.toLowerCase());
    onChange(canonical ?? name);
    setAddingVillage(false);
    setVillageDraft('');
  };

  const villagePlaceholder = !district
    ? `Select ${labels[0].toLowerCase()} first`
    : !subCounty
      ? `Select ${labels[1].toLowerCase()} first`
      : level3Required && !parish
        ? `Select ${labels[2].toLowerCase()} first`
        : verifiedVillages.length
          ? `Select ${labels[3].toLowerCase()}`
          : `Add ${labels[3].toLowerCase()}`;

  return (
    <View>
      <PickerField
        label={labels[3]}
        value={village ?? ''}
        options={villageOptions}
        onSelect={applyVillage}
        onCreate={villagePathReady ? applyVillage : undefined}
        searchable
        placeholder={villagePlaceholder}
      />
      <Text className="mb-2 text-xs text-[#757575]">
        {villagePathReady
          ? `Don’t see your ${labels[3].toLowerCase()}? Add it here — ${persistHint}`
          : `Select ${labels[0].toLowerCase()} and ${labels[1].toLowerCase()} first to choose or add a ${labels[3].toLowerCase()}.`}
      </Text>
      {villagePathReady ? (
        addingVillage ? (
          <View className="mb-4">
            <FormField
              label={`New ${labels[3]}`}
              value={villageDraft}
              onChangeText={setVillageDraft}
              placeholder={`Enter ${labels[3].toLowerCase()} name`}
              autoFocus
            />
            <View className="flex-row gap-3">
              <Button
                variant="outline"
                className="h-11 flex-1"
                onPress={() => {
                  setAddingVillage(false);
                  setVillageDraft('');
                }}
              >
                <Text>Cancel</Text>
              </Button>
              <Button
                className="h-11 flex-1 bg-[#1A4D3E]"
                disabled={!villageDraft.trim()}
                onPress={() => applyVillage(villageDraft)}
              >
                <Text className="text-white">Use this name</Text>
              </Button>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            className="mb-4 self-start py-1"
            onPress={() => {
              setVillageDraft(village ?? '');
              setAddingVillage(true);
            }}
          >
            <Text className="text-sm font-semibold text-[#1A4D3E]">Add {labels[3].toLowerCase()}</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
