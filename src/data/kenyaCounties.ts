export interface CountyData {
  code: string;
  name: string;
  formerProvince: string;
  capital: string;
  constituencies: string[];
}

export const KENYA_COUNTIES_DATA: CountyData[] = [
  {
    code: '001',
    name: 'Mombasa',
    formerProvince: 'Coast',
    capital: 'Mombasa City',
    constituencies: ['Changamwe', 'Jomvu', 'Kisauni', 'Nyali', 'Likoni', 'Mvita']
  },
  {
    code: '002',
    name: 'Kwale',
    formerProvince: 'Coast',
    capital: 'Kwale',
    constituencies: ['Msambweni', 'Lungalunga', 'Matuga', 'Kinango']
  },
  {
    code: '003',
    name: 'Kilifi',
    formerProvince: 'Coast',
    capital: 'Kilifi',
    constituencies: ['Kilifi North', 'Kilifi South', 'Kaloleni', 'Rabai', 'Ganze', 'Malindi', 'Magarini']
  },
  {
    code: '004',
    name: 'Tana River',
    formerProvince: 'Coast',
    capital: 'Hola',
    constituencies: ['Garsen', 'Galole', 'Bura']
  },
  {
    code: '005',
    name: 'Lamu',
    formerProvince: 'Coast',
    capital: 'Lamu',
    constituencies: ['Lamu East', 'Lamu West']
  },
  {
    code: '006',
    name: 'Taita-Taveta',
    formerProvince: 'Coast',
    capital: 'Mwatate',
    constituencies: ['Taveta', 'Wundanyi', 'Mwatate', 'Voi']
  },
  {
    code: '007',
    name: 'Garissa',
    formerProvince: 'North Eastern',
    capital: 'Garissa',
    constituencies: ['Garissa Township', 'Balambala', 'Lagdera', 'Dadaab', 'Fafi', 'Ijara']
  },
  {
    code: '008',
    name: 'Wajir',
    formerProvince: 'North Eastern',
    capital: 'Wajir',
    constituencies: ['Wajir North', 'Wajir East', 'Tarbaj', 'Wajir West', 'Eldas', 'Wajir South']
  },
  {
    code: '009',
    name: 'Mandera',
    formerProvince: 'North Eastern',
    capital: 'Mandera',
    constituencies: ['Mandera West', 'Banissa', 'Mandera North', 'Mandera South', 'Mandera East', 'Lafey']
  },
  {
    code: '010',
    name: 'Marsabit',
    formerProvince: 'Eastern',
    capital: 'Marsabit',
    constituencies: ['Moyale', 'North Horr', 'Saku', 'Laisamis']
  },
  {
    code: '011',
    name: 'Isiolo',
    formerProvince: 'Eastern',
    capital: 'Isiolo',
    constituencies: ['Isiolo North', 'Isiolo South']
  },
  {
    code: '012',
    name: 'Meru',
    formerProvince: 'Eastern',
    capital: 'Meru',
    constituencies: [
      'Igembe South',
      'Igembe Central',
      'Igembe North',
      'Tigania West',
      'Tigania East',
      'North Imenti',
      'Buuri',
      'Central Imenti',
      'South Imenti'
    ]
  },
  {
    code: '013',
    name: 'Tharaka-Nithi',
    formerProvince: 'Eastern',
    capital: 'Kathwana',
    constituencies: ['Maara', 'Chuka/Igambang\'ombe', 'Tharaka']
  },
  {
    code: '014',
    name: 'Embu',
    formerProvince: 'Eastern',
    capital: 'Embu',
    constituencies: ['Manyatta', 'Runyenjes', 'Mbeere South', 'Mbeere North']
  },
  {
    code: '015',
    name: 'Kitui',
    formerProvince: 'Eastern',
    capital: 'Kitui',
    constituencies: [
      'Mwingi North',
      'Mwingi West',
      'Mwingi Central',
      'Kitui West',
      'Kitui Rural',
      'Kitui Central',
      'Kitui East',
      'Kitui South'
    ]
  },
  {
    code: '016',
    name: 'Machakos',
    formerProvince: 'Eastern',
    capital: 'Machakos',
    constituencies: [
      'Masinga',
      'Yatta',
      'Kangundo',
      'Matungulu',
      'Kathiani',
      'Mavoko',
      'Machakos Town',
      'Mwala'
    ]
  },
  {
    code: '017',
    name: 'Makueni',
    formerProvince: 'Eastern',
    capital: 'Wote',
    constituencies: ['Mbooni', 'Kilome', 'Kaiti', 'Makueni', 'Kibwezi West', 'Kibwezi East']
  },
  {
    code: '018',
    name: 'Nyandarua',
    formerProvince: 'Central',
    capital: 'Ol Kalou',
    constituencies: ['Kinangop', 'Kipipiri', 'Ol Kalou', 'Ol Jorok', 'Ndaragwa']
  },
  {
    code: '019',
    name: 'Nyeri',
    formerProvince: 'Central',
    capital: 'Nyeri',
    constituencies: ['Tetu', 'Kieni', 'Mathira', 'Othaya', 'Mukurweini', 'Nyeri Town']
  },
  {
    code: '020',
    name: 'Kirinyaga',
    formerProvince: 'Central',
    capital: 'Kerugoya / Kutus',
    constituencies: ['Mwea', 'Gichugu', 'Ndia', 'Kirinyaga Central']
  },
  {
    code: '021',
    name: 'Murang\'a',
    formerProvince: 'Central',
    capital: 'Murang\'a',
    constituencies: ['Kangema', 'Mathioya', 'Kiharu', 'Kigumo', 'Maragwa', 'Kandara', 'Gatanga']
  },
  {
    code: '022',
    name: 'Kiambu',
    formerProvince: 'Central',
    capital: 'Kiambu',
    constituencies: [
      'Gatundu South',
      'Gatundu North',
      'Juja',
      'Thika Town',
      'Ruiru',
      'Githunguri',
      'Kiambu',
      'Kiambaa',
      'Kabete',
      'Kikuyu',
      'Limuru',
      'Lari'
    ]
  },
  {
    code: '023',
    name: 'Turkana',
    formerProvince: 'Rift Valley',
    capital: 'Lodwar',
    constituencies: ['Turkana North', 'Turkana West', 'Turkana Central', 'Loima', 'Turkana South', 'Turkana East']
  },
  {
    code: '024',
    name: 'West Pokot',
    formerProvince: 'Rift Valley',
    capital: 'Kapenguria',
    constituencies: ['Kapenguria', 'Sigor', 'Kacheliba', 'Pokot South']
  },
  {
    code: '025',
    name: 'Samburu',
    formerProvince: 'Rift Valley',
    capital: 'Maralal',
    constituencies: ['Samburu West', 'Samburu North', 'Samburu East']
  },
  {
    code: '026',
    name: 'Trans Nzoia',
    formerProvince: 'Rift Valley',
    capital: 'Kitale',
    constituencies: ['Kwanza', 'Endebess', 'Saboti', 'Kiminini', 'Cherangany']
  },
  {
    code: '027',
    name: 'Uasin Gishu',
    formerProvince: 'Rift Valley',
    capital: 'Eldoret City',
    constituencies: ['Soy', 'Turbo', 'Moiben', 'Ainabkoi', 'Kapseret', 'Kesses']
  },
  {
    code: '028',
    name: 'Elgeyo-Marakwet',
    formerProvince: 'Rift Valley',
    capital: 'Iten',
    constituencies: ['Marakwet East', 'Marakwet West', 'Keiyo North', 'Keiyo South']
  },
  {
    code: '029',
    name: 'Nandi',
    formerProvince: 'Rift Valley',
    capital: 'Kapsabet',
    constituencies: ['Tinderet', 'Aldai', 'Nandi Hills', 'Chesumei', 'Emgwen', 'Mosop']
  },
  {
    code: '030',
    name: 'Baringo',
    formerProvince: 'Rift Valley',
    capital: 'Kabarnet',
    constituencies: ['Tiaty', 'Baringo North', 'Baringo Central', 'Baringo South', 'Mogotio', 'Eldama Ravine']
  },
  {
    code: '031',
    name: 'Laikipia',
    formerProvince: 'Rift Valley',
    capital: 'Rumuruti',
    constituencies: ['Laikipia West', 'Laikipia East', 'Laikipia North']
  },
  {
    code: '032',
    name: 'Nakuru',
    formerProvince: 'Rift Valley',
    capital: 'Nakuru City',
    constituencies: [
      'Molo',
      'Njoro',
      'Naivasha',
      'Gilgil',
      'Kuresoi South',
      'Kuresoi North',
      'Subukia',
      'Rongai',
      'Bahati',
      'Nakuru Town West',
      'Nakuru Town East'
    ]
  },
  {
    code: '033',
    name: 'Narok',
    formerProvince: 'Rift Valley',
    capital: 'Narok',
    constituencies: ['Kilgoris', 'Emurua Dikirr', 'Narok North', 'Narok East', 'Narok South', 'Narok West']
  },
  {
    code: '034',
    name: 'Kajiado',
    formerProvince: 'Rift Valley',
    capital: 'Kajiado',
    constituencies: ['Kajiado North', 'Kajiado Central', 'Kajiado East', 'Kajiado West', 'Kajiado South']
  },
  {
    code: '035',
    name: 'Kericho',
    formerProvince: 'Rift Valley',
    capital: 'Kericho',
    constituencies: ['Kipkelion East', 'Kipkelion West', 'Ainamoi', 'Bureti', 'Belgut', 'Sigowet/Soin']
  },
  {
    code: '036',
    name: 'Bomet',
    formerProvince: 'Rift Valley',
    capital: 'Bomet',
    constituencies: ['Sotik', 'Chepalungu', 'Bomet East', 'Bomet Central', 'Konoin']
  },
  {
    code: '037',
    name: 'Kakamega',
    formerProvince: 'Western',
    capital: 'Kakamega',
    constituencies: [
      'Lugari',
      'Likuyani',
      'Malava',
      'Lurambi',
      'Navakholo',
      'Mumias West',
      'Mumias East',
      'Matungu',
      'Butere',
      'Khwisero',
      'Shinyalu',
      'Ikolomani'
    ]
  },
  {
    code: '038',
    name: 'Vihiga',
    formerProvince: 'Western',
    capital: 'Vihiga',
    constituencies: ['Vihiga', 'Sabatia', 'Hamisi', 'Luanda', 'Emuhaya']
  },
  {
    code: '039',
    name: 'Bungoma',
    formerProvince: 'Western',
    capital: 'Bungoma',
    constituencies: [
      'Mt. Elgon',
      'Sirisia',
      'Kabuchai',
      'Bumula',
      'Kanduyi',
      'Webuye West',
      'Webuye East',
      'Kimilili',
      'Tongaren'
    ]
  },
  {
    code: '040',
    name: 'Busia',
    formerProvince: 'Western',
    capital: 'Busia',
    constituencies: ['Teso North', 'Teso South', 'Nambale', 'Matayos', 'Butula', 'Funyula', 'Budalangi']
  },
  {
    code: '041',
    name: 'Siaya',
    formerProvince: 'Nyanza',
    capital: 'Siaya',
    constituencies: ['Ugenya', 'Ugunja', 'Alego Usonga', 'Gem', 'Bondo', 'Rarieda']
  },
  {
    code: '042',
    name: 'Kisumu',
    formerProvince: 'Nyanza',
    capital: 'Kisumu City',
    constituencies: ['Kisumu East', 'Kisumu West', 'Kisumu Central', 'Seme', 'Nyando', 'Muhoroni', 'Nyakach']
  },
  {
    code: '043',
    name: 'Homa Bay',
    formerProvince: 'Nyanza',
    capital: 'Homa Bay',
    constituencies: ['Kasipul', 'Kabondo Kasipul', 'Karachuonyo', 'Rangwe', 'Homa Bay Town', 'Ndhiwa', 'Suba North', 'Suba South']
  },
  {
    code: '044',
    name: 'Migori',
    formerProvince: 'Nyanza',
    capital: 'Migori',
    constituencies: ['Rongo', 'Awendo', 'Suna East', 'Suna West', 'Uriri', 'Nyatike', 'Kuria West', 'Kuria East']
  },
  {
    code: '045',
    name: 'Kisii',
    formerProvince: 'Nyanza',
    capital: 'Kisii',
    constituencies: [
      'Bonchari',
      'South Mugirango',
      'Bomachoge Borabu',
      'Bobasi',
      'Bomachoge Chache',
      'Nyaribari Masaba',
      'Nyaribari Chache',
      'Kitutu Chache North',
      'Kitutu Chache South'
    ]
  },
  {
    code: '046',
    name: 'Nyamira',
    formerProvince: 'Nyanza',
    capital: 'Nyamira',
    constituencies: ['Kitutu Masaba', 'West Mugirango', 'North Mugirango', 'Borabu']
  },
  {
    code: '047',
    name: 'Nairobi',
    formerProvince: 'Nairobi',
    capital: 'Nairobi City',
    constituencies: [
      'Westlands',
      'Dagoretti North',
      'Dagoretti South',
      'Lang\'ata',
      'Kibra',
      'Roysambu',
      'Kasarani',
      'Ruaraka',
      'Embakasi South',
      'Embakasi North',
      'Embakasi Central',
      'Embakasi East',
      'Embakasi West',
      'Makadara',
      'Kamukunji',
      'Starehe',
      'Mathare'
    ]
  }
];

export const ALL_47_COUNTIES = KENYA_COUNTIES_DATA.map((c) => c.name);

export function getConstituenciesByCounty(countyName: string): string[] {
  if (!countyName || countyName === 'All') return [];
  const found = KENYA_COUNTIES_DATA.find(
    (c) => c.name.toLowerCase() === countyName.trim().toLowerCase()
  );
  return found ? found.constituencies : [];
}

export function getCountyByCode(code: string): CountyData | undefined {
  return KENYA_COUNTIES_DATA.find((c) => c.code === code);
}
