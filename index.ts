import { I18nManager } from 'react-native';

// فرض الاتجاه من اليمين لليسار — التطبيق عربي بالكامل
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

import 'expo-router/entry';
