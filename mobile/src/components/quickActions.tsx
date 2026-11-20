import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useAppConfig } from '@/lib/config';
import { weekdayOf } from '@/lib/format';
import { colors, radius } from '@/theme';
import { Card, Gradient, haptic, Icon, Row, Txt } from './ui';

interface Action {
  icon: string;
  label: string;
  href: string;
  color: string;
}

/** A row of shortcuts under the level bar: focus, weekly review, starter packs, invite. */
export function QuickActions() {
  const { settings } = useAppConfig();
  const actions: Action[] = [
    ...(settings.focus_timer_enabled ? [{ icon: 'timer-outline', label: 'Focus', href: '/focus', color: colors.primary }] : []),
    ...(settings.weekly_review_enabled ? [{ icon: 'calendar-check-outline', label: 'Weekly review', href: '/review', color: colors.green }] : []),
    { icon: 'package-variant-closed', label: 'Starter packs', href: '/packs', color: colors.amber },
    { icon: 'account-multiple-plus-outline', label: 'Invite', href: '/invite', color: '#EC4899' },
    ...(settings.feature_gamification ? [{ icon: 'gamepad-variant-outline', label: 'Arcade', href: '/games', color: colors.blue }] : []),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }} style={{ marginTop: 14, marginHorizontal: -4 }}>
      {actions.map((a) => (
        <Pressable
          key={a.href}
          onPress={() => {
            haptic.tap();
            router.push(a.href as Href);
          }}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <View style={{ alignItems: 'center', gap: 6, width: 78 }}>
            <View style={{ width: 54, height: 54, borderRadius: radius.md, backgroundColor: a.color + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: a.color + '44' }}>
              <Icon name={a.icon} size={26} color={a.color} />
            </View>
            <Txt variant="caption" center style={{ fontSize: 12 }} numberOfLines={1}>{a.label}</Txt>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** On Sundays and Mondays: an invitation to review the week. */
export function ReviewInvite({ date }: { date: string }) {
  const { settings } = useAppConfig();
  const day = weekdayOf(date);
  if (!settings.weekly_review_enabled || (day !== 0 && day !== 1)) return null;
  return (
    <Card onPress={() => router.push('/review' as Href)} style={{ marginTop: 14 }} padded={false}>
      <Gradient colors={['#16A34A', '#4F8BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen style={{ padding: 18 }}>
        <Row gap={14}>
          <Txt style={{ fontSize: 34 }}>🗓️</Txt>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="h3">{day === 0 ? 'Your week in review is ready' : 'Review last week'}</Txt>
            <Txt variant="caption">See how it went and pick one focus for the week ahead. +{settings.xp_weekly_review} XP</Txt>
          </View>
          <Icon name="chevron-right" />
        </Row>
      </Gradient>
    </Card>
  );
}

/** First screen for a new member: a routine in one tap instead of an empty page. */
export function StartWithPack() {
  return (
    <Card onPress={() => router.push('/packs' as Href)} padded={false} style={{ marginTop: 16 }}>
      <Gradient colors={['#7C5CFF', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen glow="#7C5CFF" style={{ padding: 20, gap: 6 }}>
        <Txt style={{ fontSize: 34 }}>🎁</Txt>
        <Txt variant="h2">Start with a ready-made routine</Txt>
        <Txt variant="caption">Morning routine, Get fit, Quit smoking, Study mode… one tap sets up everything.</Txt>
        <Row gap={6} style={{ marginTop: 6 }}>
          <Txt style={{ fontWeight: '700' }}>Browse starter packs</Txt>
          <Icon name="arrow-right" size={18} />
        </Row>
      </Gradient>
    </Card>
  );
}
