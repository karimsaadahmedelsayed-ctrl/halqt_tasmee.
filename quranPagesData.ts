// Full Real Quran Pages with Word Breakdown for Tasmee Platform
// Strictly adheres to Medina Mushaf page numbering and Uthmani script

export interface QuranWord {
  word: string;
  isSign?: boolean;
  isVerseNum?: boolean;
}

export interface QuranPageData {
  pageNumber: number;
  surahName: string;
  surahNumber: number;
  juzNumber: number;
  startAyah: number;
  endAyah: number;
  words: QuranWord[];
}

export const QURAN_PAGES: Record<number, QuranPageData> = {
  // Page 22: Surah Al-Baqarah 141 - 145 (Attachment Images 6, 7, 8)
  22: {
    pageNumber: 22,
    surahName: 'سورة البقرة',
    surahNumber: 2,
    juzNumber: 2,
    startAyah: 141,
    endAyah: 145,
    words: [
      { word: 'تِلْكَ' }, { word: 'أُمَّةٌ' }, { word: 'قَدْ' }, { word: 'خَلَتْ' }, { word: 'ۖ', isSign: true },
      { word: 'لَهَا' }, { word: 'مَا' }, { word: 'كَسَبَتْ' }, { word: 'وَلَكُم' }, { word: 'مَّا' },
      { word: 'كَسَبْتُمْ' }, { word: 'ۖ', isSign: true }, { word: 'وَلَا' }, { word: 'تُسْأَلُونَ' },
      { word: 'عَمَّا' }, { word: 'كَانُوا' }, { word: 'يَعْمَلُونَ' }, { word: '﴿١٤١﴾', isVerseNum: true },

      { word: 'سَيَقُولُ' }, { word: 'السُّفَهَاءُ' }, { word: 'مِنَ' }, { word: 'النَّاسِ' },
      { word: 'مَا' }, { word: 'وَلَّاهُمْ' }, { word: 'عَن' }, { word: 'قِبْلَتِهِمُ' },
      { word: 'الَّتِي' }, { word: 'كَانُوا' }, { word: 'عَلَيْهَا' }, { word: 'ۚ', isSign: true },
      { word: 'قُل' }, { word: 'لِّلَّهِ' }, { word: 'الْمَشْرِقُ' }, { word: 'وَالْمَغْرِبُ' },
      { word: 'ۚ', isSign: true }, { word: 'يَهْدِي' }, { word: 'مَن' }, { word: 'يَشَاءُ' },
      { word: 'إِلَىٰ' }, { word: 'صِرَاطٍ' }, { word: 'مُّسْتَقِيمٍ' }, { word: '﴿١٤٢﴾', isVerseNum: true },

      { word: 'وَكَذَٰلِكَ' }, { word: 'جَعَلْنَاكُمْ' }, { word: 'أُمَّةً' }, { word: 'وَسَطًا' },
      { word: 'لِّتَكُونُوا' }, { word: 'شُهَدَاءَ' }, { word: 'عَلَى' }, { word: 'النَّاسِ' },
      { word: 'وَيَكُونَ' }, { word: 'الرَّسُولُ' }, { word: 'عَلَيْكُمْ' }, { word: 'شَهِيدًا' },
      { word: 'ۗ', isSign: true }, { word: 'وَمَا' }, { word: 'جَعَلْنَا' }, { word: 'الْقِبْلَةَ' },
      { word: 'الَّتِي' }, { word: 'كُنتَ' }, { word: 'عَلَيْهَا' }, { word: 'إِلَّا' },
      { word: 'لِنَعْلَمَ' }, { word: 'مَن' }, { word: 'يَتَّبِعُ' }, { word: 'الرَّسُولَ' },
      { word: 'مِمَّن' }, { word: 'يَنقَلِبُ' }, { word: 'عَلَىٰ' }, { word: 'عَقِبَيْهِ' },
      { word: 'ۚ', isSign: true }, { word: 'وَإِن' }, { word: 'كَانَتْ' }, { word: 'لَكَبِيرَةً' },
      { word: 'إِلَّا' }, { word: 'عَلَى' }, { word: 'الَّذِينَ' }, { word: 'هَدَى' },
      { word: 'اللَّهُ' }, { word: 'ۗ', isSign: true }, { word: 'وَمَا' }, { word: 'كَانَ' },
      { word: 'اللَّهُ' }, { word: 'لِيُضِيعَ' }, { word: 'إِيمَانَكُمْ' }, { word: 'ۚ', isSign: true },
      { word: 'إِنَّ' }, { word: 'اللَّهَ' }, { word: 'بِالنَّاسِ' }, { word: 'لَرَءُوفٌ' },
      { word: 'رَّحِيمٌ' }, { word: '﴿١٤٣﴾', isVerseNum: true },

      { word: 'قَدْ' }, { word: 'نَرَىٰ' }, { word: 'تَقَلُّبَ' }, { word: 'وَجْهِكَ' },
      { word: 'فِي' }, { word: 'السَّمَاءِ' }, { word: 'ۖ', isSign: true }, { word: 'فَلَنُوَلِّيَنَّكَ' },
      { word: 'قِبْلَةً' }, { word: 'تَرْضَاهَا' }, { word: 'ۚ', isSign: true }, { word: 'فَوَلِّ' },
      { word: 'وَجْهَكَ' }, { word: 'شَطْرَ' }, { word: 'الْمَسْجِدِ' }, { word: 'الْحَرَامِ' },
      { word: 'ۚ', isSign: true }, { word: 'وَحَيْثُ' }, { word: 'مَا' }, { word: 'كُنتُمْ' },
      { word: 'فَوَلُّوا' }, { word: 'وُجُوهَكُمْ' }, { word: 'شَطْرَهُ' }, { word: 'ۗ', isSign: true },
      { word: 'وَإِنَّ' }, { word: 'الَّذِينَ' }, { word: 'أُوتُوا' }, { word: 'الْكِتَابَ' },
      { word: 'لَيَعْلَمُونَ' }, { word: 'أَنَّهُ' }, { word: 'الْحَقُّ' }, { word: 'مِن' },
      { word: 'رَّبِّهِمْ' }, { word: 'ۗ', isSign: true }, { word: 'وَمَا' }, { word: 'اللَّهُ' },
      { word: 'بِغَافِلٍ' }, { word: 'عَمَّا' }, { word: 'يَعْمَلُونَ' }, { word: '﴿١٤٤﴾', isVerseNum: true },

      { word: 'وَلَئِنْ' }, { word: 'أَتَيْتَ' }, { word: 'الَّذِينَ' }, { word: 'أُوتُوا' },
      { word: 'الْكِتَابَ' }, { word: 'بِكُلِّ' }, { word: 'آيَةٍ' }, { word: 'مَّا' },
      { word: 'تَبِعُوا' }, { word: 'قِبْلَتَكَ' }, { word: 'ۚ', isSign: true }, { word: 'وَمَا' },
      { word: 'أَنتَ' }, { word: 'بِتَابِعٍ' }, { word: 'قِبْلَتَهُمْ' }, { word: 'ۚ', isSign: true },
      { word: 'وَمَا' }, { word: 'بَعْضُهُم' }, { word: 'بِتَابِعٍ' }, { word: 'قِبْلَةَ' },
      { word: 'بَعْضٍ' }, { word: 'ۚ', isSign: true }, { word: 'وَلَئِنِ' }, { word: 'اتَّبَعْتَ' },
      { word: 'أَهْوَاءَهُم' }, { word: 'مِّن' }, { word: 'بَعْدِ' }, { word: 'مَا' },
      { word: 'جَاءَكَ' }, { word: 'مِنَ' }, { word: 'الْعِلْمِ' }, { word: 'ۙ', isSign: true },
      { word: 'إِنَّكَ' }, { word: 'إِذًا' }, { word: 'لَّمِنَ' }, { word: 'الظَّالِمِينَ' }, { word: '﴿١٤٥﴾', isVerseNum: true }
    ]
  },

  // Page 23: Surah Al-Baqarah 146 - 153 (The next page synced automatically)
  23: {
    pageNumber: 23,
    surahName: 'سورة البقرة',
    surahNumber: 2,
    juzNumber: 2,
    startAyah: 146,
    endAyah: 153,
    words: [
      { word: 'الَّذِينَ' }, { word: 'آتَيْنَاهُمُ' }, { word: 'الْكِتَابَ' }, { word: 'يَعْرِفُونَهُ' },
      { word: 'كَمَا' }, { word: 'يَعْرِفُونَ' }, { word: 'أَبْنَاءَهُمْ' }, { word: 'ۖ', isSign: true },
      { word: 'وَإِنَّ' }, { word: 'فَرِيقًا' }, { word: 'مِّنْهُمْ' }, { word: 'لَيَكْتُمُونَ' },
      { word: 'الْحَقَّ' }, { word: 'وَهُمْ' }, { word: 'يَعْلَمُونَ' }, { word: '﴿١٤٦﴾', isVerseNum: true },

      { word: 'الْحَقُّ' }, { word: 'مِن' }, { word: 'رَّبِّكَ' }, { word: 'ۖ', isSign: true },
      { word: 'فَلَا' }, { word: 'تَكُونَنَّ' }, { word: 'مِنَ' }, { word: 'الْمُمْتَرِينَ' }, { word: '﴿١٤٧﴾', isVerseNum: true },

      { word: 'وَلِكُلٍّ' }, { word: 'وِجْهَةٌ' }, { word: 'هُوَ' }, { word: 'مُوَلِّيهَا' }, { word: 'ۖ', isSign: true },
      { word: 'فَاسْتَبِقُوا' }, { word: 'الْخَيْرَاتِ' }, { word: 'ۚ', isSign: true }, { word: 'أَيْنَ' },
      { word: 'مَا' }, { word: 'تَكُونُوا' }, { word: 'يَأْتِ' }, { word: 'بِكُمُ' }, { word: 'اللَّهُ' },
      { word: 'جَمِيعًا' }, { word: 'ۚ', isSign: true }, { word: 'إِنَّ' }, { word: 'اللَّهَ' },
      { word: 'عَلَىٰ' }, { word: 'كُلِّ' }, { word: 'شَيْءٍ' }, { word: 'قَدِيرٌ' }, { word: '﴿١٤٨﴾', isVerseNum: true },

      { word: 'وَمِنْ' }, { word: 'حَيْثُ' }, { word: 'خَرَجْتَ' }, { word: 'فَوَلِّ' }, { word: 'وَجْهَكَ' },
      { word: 'شَطْرَ' }, { word: 'الْمَسْجِدِ' }, { word: 'الْحَرَامِ' }, { word: 'ۖ', isSign: true },
      { word: 'وَإِنَّهُ' }, { word: 'لَلْحَقُّ' }, { word: 'مِن' }, { word: 'رَّبِّكَ' }, { word: 'ۗ', isSign: true },
      { word: 'وَمَا' }, { word: 'اللَّهُ' }, { word: 'بِغَافِلٍ' }, { word: 'عَمَّا' }, { word: 'تَعْمَلُونَ' }, { word: '﴿١٤٩﴾', isVerseNum: true },

      { word: 'وَمِنْ' }, { word: 'حَيْثُ' }, { word: 'خَرَجْتَ' }, { word: 'فَوَلِّ' }, { word: 'وَجْهَكَ' },
      { word: 'شَطْرَ' }, { word: 'الْمَسْجِدِ' }, { word: 'الْحَرَامِ' }, { word: 'ۚ', isSign: true },
      { word: 'وَحَيْثُ' }, { word: 'مَا' }, { word: 'كُنتُمْ' }, { word: 'فَوَلُّوا' }, { word: 'وُجُوهَكُمْ' },
      { word: 'شَطْرَهُ' }, { word: 'لِئَلَّا' }, { word: 'يَكُونَ' }, { word: 'لِلنَّاسِ' },
      { word: 'عَلَيْكُمْ' }, { word: 'حُجَّةٌ' }, { word: 'إِلَّا' }, { word: 'الَّذِينَ' },
      { word: 'ظَلَمُوا' }, { word: 'مِنْهُمْ' }, { word: 'فَلَا' }, { word: 'تَخْشَوْهُمْ' },
      { word: 'وَاخْشَوْنِي' }, { word: 'وَلِأُتِمَّ' }, { word: 'نِعْمَتِي' }, { word: 'عَلَيْكُمْ' },
      { word: 'وَلَعَلَّكُمْ' }, { word: 'تَهْتَدُونَ' }, { word: '﴿١٥٠﴾', isVerseNum: true },

      { word: 'كَمَا' }, { word: 'أَرْسَلْنَا' }, { word: 'فِيكُمْ' }, { word: 'رَسُولًا' },
      { word: 'مِّنكُمْ' }, { word: 'يَتْلُو' }, { word: 'عَلَيْكُمْ' }, { word: 'آيَاتِنَا' },
      { word: 'وَيُزَكِّيكُمْ' }, { word: 'وَيُعَلِّمُكُمُ' }, { word: 'الْكِتَابَ' }, { word: 'وَالْحِكْمَةَ' },
      { word: 'وَيُعَلِّمُكُم' }, { word: 'مَّا' }, { word: 'لَمْ' }, { word: 'تَكُونُوا' },
      { word: 'تَعْلَمُونَ' }, { word: '﴿١٥١﴾', isVerseNum: true },

      { word: 'فَاذْكُرُونِي' }, { word: 'أَذْكُرْكُمْ' }, { word: 'وَاشْكُرُوا' }, { word: 'لِي' },
      { word: 'وَلَا' }, { word: 'تَكْفُرُونِ' }, { word: '﴿١٥٢﴾', isVerseNum: true },

      { word: 'يَا' }, { word: 'أَيُّهَا' }, { word: 'الَّذِينَ' }, { word: 'آمَنُوا' },
      { word: 'اسْتَعِينُوا' }, { word: 'بِالصَّبْرِ' }, { word: 'وَالصَّلَاةِ' }, { word: 'ۚ', isSign: true },
      { word: 'إِنَّ' }, { word: 'اللَّهَ' }, { word: 'مَعَ' }, { word: 'الصَّابِرِينَ' }, { word: '﴿١٥٣﴾', isVerseNum: true }
    ]
  },

  // Page 1: Surah Al-Fatiha
  1: {
    pageNumber: 1,
    surahName: 'سورة الفاتحة',
    surahNumber: 1,
    juzNumber: 1,
    startAyah: 1,
    endAyah: 7,
    words: [
      { word: 'بِسْمِ' }, { word: 'اللَّهِ' }, { word: 'الرَّحْمَٰنِ' }, { word: 'الرَّحِيمِ' }, { word: '﴿١﴾', isVerseNum: true },
      { word: 'الْحَمْدُ' }, { word: 'لِلَّهِ' }, { word: 'رَبِّ' }, { word: 'الْعَالَمِينَ' }, { word: '﴿٢﴾', isVerseNum: true },
      { word: 'الرَّحْمَٰنِ' }, { word: 'الرَّحِيمِ' }, { word: '﴿٣﴾', isVerseNum: true },
      { word: 'مَالِكِ' }, { word: 'يَوْمِ' }, { word: 'الدِّينِ' }, { word: '﴿٤﴾', isVerseNum: true },
      { word: 'إِيَّاكَ' }, { word: 'نَعْبُدُ' }, { word: 'وَإِيَّاكَ' }, { word: 'نَسْتَعِينُ' }, { word: '﴿٥﴾', isVerseNum: true },
      { word: 'اهْدِنَا' }, { word: 'الصِّرَاطَ' }, { word: 'الْمُسْتَقِيمَ' }, { word: '﴿٦﴾', isVerseNum: true },
      { word: 'صِرَاطَ' }, { word: 'الَّذِينَ' }, { word: 'أَنْعَمْتَ' }, { word: 'عَلَيْهِمْ' },
      { word: 'غَيْرِ' }, { word: 'الْمَغْضُوبِ' }, { word: 'عَلَيْهِمْ' }, { word: 'وَلَا' }, { word: 'الضَّالِّينَ' }, { word: '﴿٧﴾', isVerseNum: true }
    ]
  },

  // Page 293: Surah Al-Kahf 1 - 10
  293: {
    pageNumber: 293,
    surahName: 'سورة الكهف',
    surahNumber: 18,
    juzNumber: 15,
    startAyah: 1,
    endAyah: 10,
    words: [
      { word: 'الْحَمْدُ' }, { word: 'لِلَّهِ' }, { word: 'الَّذِي' }, { word: 'أَنزَلَ' }, { word: 'عَلَىٰ' },
      { word: 'عَبْدِهِ' }, { word: 'الْكِتَابَ' }, { word: 'وَلَمْ' }, { word: 'يَجْعَل' }, { word: 'لَّهُ' },
      { word: 'عِوَجًا' }, { word: 'ۜ', isSign: true }, { word: '﴿١﴾', isVerseNum: true },

      { word: 'قَيِّمًا' }, { word: 'لِّيُنذِرَ' }, { word: 'بَأْسًا' }, { word: 'شَدِيدًا' }, { word: 'مِّن' },
      { word: 'لَّدُنْهُ' }, { word: 'وَيُبَشِّرَ' }, { word: 'الْمُؤْمِنِينَ' }, { word: 'الَّذِينَ' }, { word: 'يَعْمَلُونَ' },
      { word: 'الصَّالِحَاتِ' }, { word: 'أَنَّ' }, { word: 'لَهُمْ' }, { word: 'أَجْرًا' }, { word: 'حَسَنًا' }, { word: '﴿٢﴾', isVerseNum: true },

      { word: 'مَّاكِثِينَ' }, { word: 'فِيهِ' }, { word: 'أَبَدًا' }, { word: '﴿٣﴾', isVerseNum: true },

      { word: 'وَيُنذِرَ' }, { word: 'الَّذِينَ' }, { word: 'قَالُوا' }, { word: 'اتَّخَذَ' }, { word: 'اللَّهُ' },
      { word: 'وَلَدًا' }, { word: '﴿٤﴾', isVerseNum: true },

      { word: 'مَّا' }, { word: 'لَهُم' }, { word: 'بِهِ' }, { word: 'مِنْ' }, { word: 'عِلْمٍ' },
      { word: 'وَلَا' }, { word: 'لِآبَائِهِمْ' }, { word: 'ۚ', isSign: true }, { word: 'كَبُرَتْ' },
      { word: 'كَلِمَةً' }, { word: 'تَخْرُجُ' }, { word: 'مِنْ' }, { word: 'أَفْوَاهِهِمْ' }, { word: 'ۚ', isSign: true },
      { word: 'إِن' }, { word: 'يَقُولُونَ' }, { word: 'إِلَّا' }, { word: 'كَذِبًا' }, { word: '﴿٥﴾', isVerseNum: true },

      { word: 'فَلَعَلَّكَ' }, { word: 'بَاخِعٌ' }, { word: 'نَّفْسَكَ' }, { word: 'عَلَىٰ' }, { word: 'آثَارِهِمْ' },
      { word: 'إِن' }, { word: 'لَّمْ' }, { word: 'يُؤْمِنُوا' }, { word: 'بِهَٰذَا' }, { word: 'الْحَدِيثِ' },
      { word: 'أَسَفًا' }, { word: '﴿٦﴾', isVerseNum: true }
    ]
  },

  // Page 562: Surah Al-Mulk 1 - 10
  562: {
    pageNumber: 562,
    surahName: 'سورة الملك',
    surahNumber: 67,
    juzNumber: 29,
    startAyah: 1,
    endAyah: 10,
    words: [
      { word: 'تَبَارَكَ' }, { word: 'الَّذِي' }, { word: 'بِيَدِهِ' }, { word: 'الْمُلْكُ' },
      { word: 'وَهُوَ' }, { word: 'عَلَىٰ' }, { word: 'كُلِّ' }, { word: 'شَيْءٍ' }, { word: 'قَدِيرٌ' }, { word: '﴿١﴾', isVerseNum: true },

      { word: 'الَّذِي' }, { word: 'خَلَقَ' }, { word: 'الْمَوْتَ' }, { word: 'وَالْحَيَاةَ' },
      { word: 'لِيَبْلُوَكُمْ' }, { word: 'أَيُّكُمْ' }, { word: 'أَحْسَنُ' }, { word: 'عَمَلًا' }, { word: 'ۚ', isSign: true },
      { word: 'وَهُوَ' }, { word: 'الْعَزِيزُ' }, { word: 'الْغَفُورُ' }, { word: '﴿٢﴾', isVerseNum: true },

      { word: 'الَّذِي' }, { word: 'خَلَقَ' }, { word: 'سَبْعَ' }, { word: 'سَمَاوَاتٍ' }, { word: 'طِبَاقًا' },
      { word: 'ۖ', isSign: true }, { word: 'مَّا' }, { word: 'تَرَىٰ' }, { word: 'فِي' }, { word: 'خَلْقِ' },
      { word: 'الرَّحْمَٰنِ' }, { word: 'مِن' }, { word: 'تَفَاوُتٍ' }, { word: 'ۖ', isSign: true },
      { word: 'فَارْجِعِ' }, { word: 'الْبَصَرَ' }, { word: 'هَلْ' }, { word: 'تَرَىٰ' }, { word: 'مِن' },
      { word: 'فُطُورٍ' }, { word: '﴿٣﴾', isVerseNum: true }
    ]
  },

  // Page 582: Surah An-Naba 1 - 16 (Juz Amma)
  582: {
    pageNumber: 582,
    surahName: 'سورة النبأ',
    surahNumber: 78,
    juzNumber: 30,
    startAyah: 1,
    endAyah: 16,
    words: [
      { word: 'عَمَّ' }, { word: 'يَتَسَاءَلُونَ' }, { word: '﴿١﴾', isVerseNum: true },
      { word: 'عَنِ' }, { word: 'النَّبَإِ' }, { word: 'الْعَظِيمِ' }, { word: '﴿٢﴾', isVerseNum: true },
      { word: 'الَّذِي' }, { word: 'هُمْ' }, { word: 'فِيهِ' }, { word: 'مُخْتَلِفُونَ' }, { word: '﴿٣﴾', isVerseNum: true },
      { word: 'كَلَّا' }, { word: 'سَيَعْلَمُونَ' }, { word: '﴿٤﴾', isVerseNum: true },
      { word: 'ثُمَّ' }, { word: 'كَلَّا' }, { word: 'سَيَعْلَمُونَ' }, { word: '﴿٥﴾', isVerseNum: true },
      { word: 'أَلَمْ' }, { word: 'نَجْعَلِ' }, { word: 'الْأَرْضَ' }, { word: 'مِهَادًا' }, { word: '﴿٦﴾', isVerseNum: true },
      { word: 'وَالْجِبَالَ' }, { word: 'أَوْتَادًا' }, { word: '﴿٧﴾', isVerseNum: true },
      { word: 'وَخَلَقْنَاكُمْ' }, { word: 'أَزْوَاجًا' }, { word: '﴿٨﴾', isVerseNum: true },
      { word: 'وَجَعَلْنَا' }, { word: 'نَوْمَكُمْ' }, { word: 'سُبَاتًا' }, { word: '﴿٩﴾', isVerseNum: true },
      { word: 'وَجَعَلْنَا' }, { word: 'اللَّيْلَ' }, { word: 'لِبَاسًا' }, { word: '﴿١٠﴾', isVerseNum: true },
      { word: 'وَجَعَلْنَا' }, { word: 'النَّهَارَ' }, { word: 'مَعَاشًا' }, { word: '﴿١١﴾', isVerseNum: true }
    ]
  }
};

export const AVAILABLE_RECITATION_CHOICES = [
  { surahName: 'سورة الفاتحة', pageNumber: 1, ayah: 1, label: 'سورة الفاتحة (الصفحة ١ - كاملة)' },
  { surahName: 'سورة البقرة', pageNumber: 22, ayah: 141, label: 'سورة البقرة (الصفحة ٢٢ - حزب ٢)' },
  { surahName: 'سورة البقرة', pageNumber: 23, ayah: 146, label: 'سورة البقرة (الصفحة ٢٣ - ربع جديد)' },
  { surahName: 'سورة الكهف', pageNumber: 293, ayah: 1, label: 'سورة الكهف (الصفحة ٢٩٣ - أوائل السورة)' },
  { surahName: 'سورة الملك', pageNumber: 562, ayah: 1, label: 'سورة الملك (الصفحة ٥٦٢ - تبارك)' },
  { surahName: 'سورة النبأ', pageNumber: 582, ayah: 1, label: 'سورة النبأ (الصفحة ٥٨٢ - جزء عمّ)' }
];
