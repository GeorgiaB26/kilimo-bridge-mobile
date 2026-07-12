import { buildLocationTree, type LocationTree } from './helpers';

/** Uganda districts (135 administrative districts) */
export const UGANDA_DISTRICTS = [
  'Abim', 'Adjumani', 'Agago', 'Alebtong', 'Amolatar', 'Amudat', 'Amuria', 'Amuru',
  'Apac', 'Arua', 'Budaka', 'Bududa', 'Bugiri', 'Bugweri', 'Buhweju', 'Buikwe',
  'Bukedea', 'Bukomansimbi', 'Bukwo', 'Bulambuli', 'Buliisa', 'Bundibugyo', 'Bunyangabu',
  'Bushenyi', 'Busia', 'Butaleja', 'Butambala', 'Buvuma', 'Buyende', 'Dokolo', 'Gomba',
  'Gulu', 'Hoima', 'Ibanda', 'Iganga', 'Isingiro', 'Jinja', 'Kaabong', 'Kabale',
  'Kabarole', 'Kaberamaido', 'Kalaki', 'Kalangala', 'Kaliro', 'Kalungu', 'Kampala',
  'Kamuli', 'Kamwenge', 'Kanungu', 'Kapchorwa', 'Kapelebyong', 'Karenga', 'Kasese',
  'Katakwi', 'Kayunga', 'Kazo', 'Kibaale', 'Kiboga', 'Kibuku', 'Kiruhura', 'Kiryandongo',
  'Kisoro', 'Kitagwenda', 'Kitgum', 'Koboko', 'Kole', 'Kotido', 'Kumi', 'Kwania',
  'Kween', 'Kyankwanzi', 'Kyegegwa', 'Kyenjojo', 'Kyotera', 'Lamwo', 'Lira', 'Luuka',
  'Lwengo', 'Lyantonde', 'Manafwa', 'Maracha', 'Masaka', 'Masindi', 'Mayuge', 'Mbale',
  'Mbarara', 'Mitooma', 'Mityana', 'Moroto', 'Moyo', 'Mpigi', 'Mubende', 'Mukono',
  'Nakapiripirit', 'Nakaseke', 'Nakasongola', 'Namayingo', 'Namisindwa', 'Namutumba',
  'Napak', 'Nebbi', 'Ngora', 'Ntoroko', 'Ntungamo', 'Nwoya', 'Obongi', 'Omoro',
  'Otuke', 'Oyam', 'Pader', 'Pakwach', 'Pallisa', 'Rakai', 'Rubanda', 'Rubirizi',
  'Rukiga', 'Rukungiri', 'Sembabule', 'Serere', 'Sheema', 'Sironko', 'Soroti', 'Tororo',
  'Wakiso', 'Yumbe', 'Zombo',
] as const;

export const UGANDA_DETAILED: LocationTree = {
  Gulu: {
    Central: ['Layibi', 'Bardege', 'Laroo'],
    Pader: ['Pader Town', 'Angagura'],
    Aswa: ['Atiak', 'Lakwana'],
    Nwoya: ['Anaka', 'Koch Goma'],
  },
  Kampala: {
    Makindye: ['Kibuli', 'Nsambya', 'Kansanga'],
    Kawempe: ['Kawempe', 'Bwaise', 'Makerere'],
    Nakawa: ['Bugolobi', 'Ntinda', 'Kyambogo'],
    Rubaga: ['Rubaga', 'Mutundwe', 'Lubaga'],
    Central: ['Nakasero', 'Kololo', 'Old Kampala'],
  },
  Mbarara: {
    Nyarugusu: ['Kakoba', 'Kamukuzi'],
    Kabale: ['Northern', 'Southern'],
    Kashari: ['Rubaya', 'Biharwe', 'Kagongi'],
    Rwampara: ['Rwampara', 'Bugamba', 'Ndaija'],
  },
  Wakiso: {
    Entebbe: ['Entebbe Central', 'Kigungu', 'Nakiwogo'],
    Kira: ['Kira', 'Bweyogerere', 'Namugongo'],
    Nansana: ['Nansana', 'Nabweru', 'Gombe'],
  },
  Jinja: {
    Central: ['Walukuba', 'Masese', 'Bugembe'],
    Buwenge: ['Buwenge', 'Kakira', 'Mafubira'],
  },
  Mbale: {
    Industrial: ['Industrial Division', 'Wanale', 'Namakwekwe'],
    Northern: ['Bungokho', 'Bubyangu', 'Bukasakya'],
  },
  Lira: {
    Lira: ['Adyel', 'Ojwina', 'Railways'],
    Erute: ['Agweng', 'Adekokwok', 'Barr'],
  },
  Mukono: {
    Mukono: ['Goma', 'Kisoga', 'Namanve'],
    Nakifuma: ['Nakifuma', 'Kimenyedde', 'Kasawo'],
  },
  Masaka: {
    Nyendo: ['Nyendo', 'Kitovu', 'Bukoto'],
    Kimaanya: ['Kimaanya', 'Katwe', 'Kyanamukaaka'],
  },
  Hoima: {
    Hoima: ['Mparo', 'Bujumbura', 'Kahoora'],
    Bugahya: ['Bugahya', 'Kigorobya', 'Kyangwali'],
  },
  Amuru: {
    Amuru: ['Labongogali', 'Lakwana', 'Pabbo', 'Atiak'],
    'Amuru North': ['Lakwana North', 'Pabbo North'],
  },
};

export const UGANDA_LOCATIONS = buildLocationTree(UGANDA_DISTRICTS, UGANDA_DETAILED);
