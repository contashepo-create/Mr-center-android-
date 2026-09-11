import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, Card } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { colors, font, spacing, themedStyles } from '../../src/theme';

/** تسجيل فريق العمل يتم حصراً من صاحب السنتر. لا يوجد تسجيل ذاتي للمدرس أو السكرتير. */
export default function RegisterTeacherScreen() {
  return <GradientScreen><BackHeader title="حساب فريق العمل" /><KeyboardScreen>
    <View style={styles.hero}><Ionicons name="shield-checkmark" size={58} color={colors.primary} />
      <Text style={styles.title}>إضافة آمنة بواسطة صاحب السنتر</Text>
      <Text style={styles.sub}>لا يمكن للمدرس أو السكرتير إنشاء حساب من تلقاء نفسه.</Text></View>
    <Card><Text style={styles.body}>على صاحب السنتر إضافة الحساب من قسم «فريق العمل»، واختيار الدور والصلاحيات والمجموعات. سيتم تطبيق حد الباقة تلقائياً، ولا يصبح الحساب فعالاً إلا بعد اعتماده من السنتر.</Text>
      <AppButton title="العودة لتسجيل الدخول" icon="log-in" onPress={() => router.replace('/')} />
      <View style={{ height: spacing.sm }} /><AppButton title="تسجيل دخول صاحب السنتر" icon="business" variant="outline" onPress={() => router.push('/auth/login-admin')} />
    </Card>
  </KeyboardScreen></GradientScreen>;
}
const styles = themedStyles(() => StyleSheet.create({ hero:{alignItems:'center',paddingVertical:spacing.xxl},title:{color:colors.text,fontSize:font.xl,fontWeight:'900',textAlign:'center',marginTop:spacing.md},sub:{color:colors.textSecondary,fontSize:font.md,textAlign:'center',marginTop:spacing.sm},body:{color:colors.textSecondary,fontSize:font.md,textAlign:'right',lineHeight:27,marginBottom:spacing.lg}}));
