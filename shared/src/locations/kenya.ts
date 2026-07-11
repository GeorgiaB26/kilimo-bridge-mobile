import { buildLocationTree, type LocationTree } from './helpers';

export const KENYA_COUNTIES = [
  'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita-Taveta',
  'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru', 'Tharaka-Nithi',
  'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga',
  "Murang'a", 'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans Nzoia',
  'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nakuru',
  'Narok', 'Kajiado', 'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma',
  'Busia', 'Siaya', 'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi',
] as const;

/** Detailed hierarchies for high-volume registration counties */
export const KENYA_DETAILED: LocationTree = {
  Kiambu: {
    Limuru: ['Ndeiya', 'Bibirioni', 'Ngecha'],
    Thika: ['Township', 'Kamenu', 'Hospital'],
    Ruiru: ['Biashara', 'Gitothua', 'Kahawa Sukari'],
    Kikuyu: ['Karai', 'Nachu', 'Sigona'],
    Gatundu: ['Gatundu South', 'Gatundu North'],
  },
  Nyeri: {
    'Mathira East': ['Konyu', 'Iria-Ini', 'Gathima'],
    'Mathira West': ['Ruguru', 'Gikondi', 'Magutu'],
    Tetu: ['Dedan Kimathi', 'Wamagana', 'Aguthi'],
    'Nyeri Central': ['Ruringu', 'Kamakwa', 'Mukaro'],
  },
  Nairobi: {
    Westlands: ['Parklands', 'Kangemi', 'Mountain View'],
    Kasarani: ['Clay City', 'Mwiki', 'Njiru'],
    Embakasi: ['Utawala', 'Pipeline', 'Tassia'],
    Dagoretti: ['Mutuini', 'Ngando', 'Riruta'],
    Starehe: ['Nairobi Central', 'Landimawe', 'Nairobi South'],
  },
  Nakuru: {
    'Nakuru Town East': ['Biashara', 'Flamingo', 'Menengai'],
    'Nakuru Town West': ['London', 'Shaabab', 'Kaptembwo'],
    Naivasha: ['Naivasha East', 'Naivasha West', 'Hellsgate'],
    Gilgil: ['Gilgil', 'Elementaita', 'Malewa West'],
  },
  Kisumu: {
    'Kisumu Central': ['Market Milimani', 'Kondele', 'Nyalenda'],
    'Kisumu East': ['Kajulu', 'Kolwa East', 'Kolwa Central'],
    'Kisumu West': ['Central Kisumu', 'South West Kisumu', 'North West Kisumu'],
  },
  Mombasa: {
    Mvita: ['Majengo', 'Tononoka', 'Old Town'],
    Nyali: ['Frere Town', 'Kongowea', 'Mkomani'],
    Changamwe: ['Port Reitz', 'Chaani', 'Airport'],
    Kisauni: ['Junda', 'Bamburi', 'Mwakirunge'],
  },
  'Uasin Gishu': {
    Eldoret: ['Kapsoya', 'Kimumu', 'Langas'],
    Turbo: ['Tapsagoi', 'Kamagut', 'Ngenyilel'],
    Soy: ['Ziwa', 'Kipsomba', 'Kuinet'],
    Moiben: ['Moiben', 'Tembelio', 'Kaptagat'],
  },
  Kilifi: {
    Kilifi: ['Kilifi North', 'Kilifi South', 'Mnarani'],
    Malindi: ['Malindi Town', 'Shella', 'Jilore'],
    Kaloleni: ['Kaloleni', 'Mariakani', 'Mwanamwinga'],
  },
  Meru: {
    'Imenti North': ['Municipality', 'Ntima East', 'Ntima West'],
    'Imenti South': ['Igoji East', 'Igoji West', 'Abogeta'],
    Tigania: ['Tigania East', 'Tigania West', 'Kianjai'],
  },
  Kakamega: {
    Lurambi: ['Butsotso Central', 'Butsotso East', 'Butsotso South'],
    Shinyalu: ['Shinyalu', 'Isukha Central', 'Murhanda'],
    Mumias: ['Mumias Central', 'Mumias East', 'Mumias North'],
  },
};

export const KENYA_LOCATIONS = buildLocationTree(KENYA_COUNTIES, KENYA_DETAILED);
