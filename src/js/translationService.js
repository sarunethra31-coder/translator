// Translation Router and Multi-Language API Service

import {
  isTanglish,
  translateTanglishToEnglish,
  transliterateTanglishToTamil,
  translateEnglishToTanglish
} from './tanglishEngine.js';

// Cache for API responses to ensure fast offline / repeat queries
const translationCache = new Map();

/**
 * Main Translate Router Function
 * @param {string} text - Source text
 * @param {string} sourceLang - Source language code ('auto', 'tanglish', 'en', 'ta', 'hi', etc.)
 * @param {string} targetLang - Target language code ('en', 'tanglish', 'ta', 'hi', 'es', etc.)
 * @returns {Promise<{ translatedText: string, detectedLang?: string, secondaryScript?: string }>}
 */
export async function translateText(text, sourceLang = 'auto', targetLang = 'en') {
  if (!text || !text.trim()) {
    return { translatedText: '', secondaryScript: '' };
  }

  const cleanText = text.trim();

  // 1. Auto-Detect Tanglish if source is auto
  let actualSource = sourceLang;
  if (sourceLang === 'auto') {
    if (isTanglish(cleanText)) {
      actualSource = 'tanglish';
    } else {
      actualSource = 'en'; // default auto fallback
    }
  }

  // 2. CASE A: Translating FROM Tanglish
  if (actualSource === 'tanglish') {
    const englishTranslation = translateTanglishToEnglish(cleanText);
    const tamilScript = transliterateTanglishToTamil(cleanText);

    if (targetLang === 'en') {
      return {
        translatedText: englishTranslation,
        detectedLang: 'Tanglish',
        secondaryScript: tamilScript !== cleanText ? tamilScript : ''
      };
    }

    if (targetLang === 'ta') {
      return {
        translatedText: tamilScript,
        detectedLang: 'Tanglish',
        secondaryScript: englishTranslation
      };
    }

    // Translating Tanglish to another language (e.g. Hindi, Spanish, French, German, Telugu)
    // First convert Tanglish to English, then translate English to target lang via API
    try {
      const apiResult = await fetchExternalTranslation(englishTranslation, 'en', targetLang);
      return {
        translatedText: apiResult,
        detectedLang: 'Tanglish',
        secondaryScript: `English: ${englishTranslation}`
      };
    } catch (err) {
      console.warn("External translation failed, returning English:", err);
      return {
        translatedText: englishTranslation,
        detectedLang: 'Tanglish',
        secondaryScript: tamilScript
      };
    }
  }

  // 3. CASE B: Translating TO Tanglish
  if (targetLang === 'tanglish') {
    let englishText = cleanText;

    // If source is not English, first translate to English
    if (actualSource !== 'en') {
      try {
        englishText = await fetchExternalTranslation(cleanText, actualSource, 'en');
      } catch (e) {
        console.warn("Source to EN translation failed:", e);
      }
    }

    const tanglishResult = translateEnglishToTanglish(englishText);
    const tamilScript = transliterateTanglishToTamil(tanglishResult);

    return {
      translatedText: tanglishResult,
      detectedLang: actualSource.toUpperCase(),
      secondaryScript: tamilScript !== tanglishResult ? tamilScript : ''
    };
  }

  // 4. CASE C: Standard Language to Language Translation (e.g. English -> Hindi, French -> Tamil)
  if (actualSource === targetLang) {
    return { translatedText: cleanText, secondaryScript: '' };
  }

  try {
    const translated = await fetchExternalTranslation(cleanText, actualSource, targetLang);
    return {
      translatedText: translated,
      detectedLang: actualSource.toUpperCase(),
      secondaryScript: ''
    };
  } catch (err) {
    console.error("Translation API Error:", err);
    return {
      translatedText: cleanText,
      detectedLang: actualSource.toUpperCase(),
      secondaryScript: 'Offline fallback (Translation server busy)'
    };
  }
}

/**
 * Quick direct offline translation overrides for instantaneous high-accuracy results
 */
const quickTranslationMap = {
  'en_ta_hello': 'வணக்கம்',
  'en_ta_hi': 'வணக்கம்',
  'en_ta_hello guys': 'வணக்கம் நண்பர்களே',
  'en_ta_where are you': 'எங்கே இருக்கீங்க',
  'en_ta_hello guys, where are you': 'வணக்கம் நண்பர்களே, எங்கே இருக்கீங்க',
  'en_ta_how are you': 'எப்படி இருக்கீங்க',
  'en_ta_salt water': 'உப்புத் தண்ணீர்',
  'en_ta_water': 'தண்ணீர்',
  'en_ta_thank you': 'நன்றி',
  'en_ta_goodbye': 'போயிட்டு வர்றேன்'
};

/**
 * Fetch translation using Google Translate free API with MyMemory fallback
 */
async function fetchExternalTranslation(text, fromLang, toLang) {
  const clean = text.trim();
  const cacheKey = `${fromLang}_${toLang}_${clean}`;
  
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  // Check quick dictionary overrides first
  const quickKey = `${fromLang}_${toLang}_${clean.toLowerCase()}`;
  if (quickTranslationMap[quickKey]) {
    const result = quickTranslationMap[quickKey];
    translationCache.set(cacheKey, result);
    return result;
  }

  // 1. Try Google Translate Free GTX Endpoint (Most accurate multi-language translation)
  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(clean)}`;
    const gRes = await fetch(gUrl);
    if (gRes.ok) {
      const gData = await gRes.json();
      if (Array.isArray(gData) && gData[0] && Array.isArray(gData[0])) {
        const translated = gData[0].map(item => item[0]).filter(Boolean).join('');
        if (translated && translated.trim()) {
          translationCache.set(cacheKey, translated.trim());
          return translated.trim();
        }
      }
    }
  } catch (e) {
    console.warn("Google Translate API failed, trying MyMemory fallback:", e);
  }

  // 2. Fallback: MyMemory API
  try {
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${fromLang}|${toLang}`;
    const mmRes = await fetch(myMemoryUrl);
    if (mmRes.ok) {
      const mmData = await mmRes.json();
      if (mmData && mmData.responseData && mmData.responseData.translatedText) {
        const result = mmData.responseData.translatedText;
        translationCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.error("MyMemory API failed:", err);
  }

  return clean;
}
