import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Gradient, haptic, Icon, Row, Screen, Txt } from '@/components/ui';
import { CATEGORIES } from '@/lib/catalog';
import { requestReminderPermission } from '@/lib/notifications';
import { usePrefs } from '@/lib/prefs';
import type { CategoryKey } from '@/lib/types';
import { colors, gradients, radius } from '@/theme';

type Step = 0 | 1 | 2;

export default function Onboarding() {
  const update = usePrefs((s) => s.update);
  const [step, setStep] = useState<Step>(0);
  const [interests, setInterests] = useState<CategoryKey[]>([]);
  const [reminders, setReminders] = useState<'unset' | 'granted' | 'denied'>('unset');

  const finish = async () => {
    haptic.success();
    await update({ onboarded: true, interests, remindersConsent: reminders === 'granted' });
  };

  return (
    <Screen contentStyle={{ flexGrow: 1, paddingBottom: 40 }}>
      <Row gap={6} style={{ justifyContent: 'center', marginBottom: 28, marginTop: 8 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ height: 6, width: i === step ? 28 : 6, borderRadius: 3, backgroundColor: i <= step ? colors.primary : colors.surfaceHigh }} />
        ))}
      </Row>

      {step === 0 && <Welcome onNext={() => setStep(1)} />}
      {step === 1 && <Interests value={interests} onChange={setInterests} onNext={() => setStep(2)} />}
      {step === 2 && (
        <Permissions
          reminders={reminders}
          onAllow={async () => setReminders((await requestReminderPermission()) ? 'granted' : 'denied')}
          onFinish={finish}
        />
      )}
    </Screen>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const points = [
    { icon: 'dumbbell', color: colors.amber, text: 'Build any habit — workouts, reading, sleep, meditation, saving' },
    { icon: 'cancel', color: colors.red, text: 'Quit or cut down — smoking, alcohol, social media, junk food' },
    { icon: 'fire', color: colors.green, text: 'Streaks, XP and badges that make you want to show up every day' },
    { icon: 'chart-timeline-variant', color: colors.blue, text: 'See your progress daily, weekly and monthly' },
  ];
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 32 }}>
      <View style={{ gap: 28 }}>
        <Gradient colors={gradients.primary} style={{ width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
          <Icon name="anchor" size={44} />
        </Gradient>
        <View style={{ gap: 12 }}>
          <Txt variant="title" center style={{ fontSize: 32, lineHeight: 38 }}>Keep the promises you make to yourself</Txt>
          <Txt variant="caption" center style={{ fontSize: 16, lineHeight: 23 }}>
            Pick what you want to change, set your own goal, and Anchor helps you show up every single day.
          </Txt>
        </View>
        <View style={{ gap: 18, marginTop: 8 }}>
          {points.map((p) => (
            <Row key={p.text} gap={14}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: p.color + '1F', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={p.icon} size={22} color={p.color} />
              </View>
              <Txt style={{ flex: 1 }}>{p.text}</Txt>
            </Row>
          ))}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Get started" icon="arrow-right" onPress={onNext} />
        <Button title="I already have an account" variant="ghost" onPress={() => router.push('/login')} />
      </View>
    </View>
  );
}

function Interests({ value, onChange, onNext }: { value: CategoryKey[]; onChange: (v: CategoryKey[]) => void; onNext: () => void }) {
  const toggle = (k: CategoryKey) => {
    haptic.tap();
    onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  };
  return (
    <View style={{ flex: 1, gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Txt variant="title">What do you want to work on?</Txt>
        <Txt variant="caption">Pick as many as you like. We’ll tailor your home screen — you can change this anytime.</Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
        {CATEGORIES.map((c) => {
          const on = value.includes(c.key);
          return (
            <Pressable
              key={c.key}
              onPress={() => toggle(c.key)}
              style={{
                width: '48.5%',
                minHeight: 128,
                padding: 16,
                gap: 10,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: on ? c.color : colors.border,
                backgroundColor: on ? c.color + '1A' : colors.surface,
              }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.color + '26', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={c.icon} size={22} color={c.color} />
                </View>
                <Icon name={on ? 'check-circle' : 'circle-outline'} size={22} color={on ? c.color : colors.textDim} />
              </Row>
              <Txt variant="h3">{c.label}</Txt>
              <Txt variant="caption" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={2}>{c.description}</Txt>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 10, marginTop: 'auto' }}>
        <Button title={value.length ? 'Continue' : 'Choose at least one'} disabled={!value.length} onPress={onNext} />
        <Button title="Skip for now" variant="ghost" onPress={onNext} />
      </View>
    </View>
  );
}

function Permissions({ reminders, onAllow, onFinish }: { reminders: 'unset' | 'granted' | 'denied'; onAllow: () => void; onFinish: () => void }) {
  return (
    <View style={{ flex: 1, gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Txt variant="title">You’re in control</Txt>
        <Txt variant="caption">We only ask for what makes the app work for you — and nothing is accessed without your permission.</Txt>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 14 }}>
        <Row gap={14}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bell-ring-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">Reminders</Txt>
            <Txt variant="caption">Only at the times you choose — like reading your rules before you trade. Optional.</Txt>
          </View>
        </Row>
        {reminders === 'unset' ? (
          <Button title="Allow reminders" variant="secondary" small icon="bell-outline" onPress={onAllow} />
        ) : (
          <Row gap={8}>
            <Icon name={reminders === 'granted' ? 'check-circle' : 'information'} size={18} color={reminders === 'granted' ? colors.green : colors.textMuted} />
            <Txt variant="caption" color={reminders === 'granted' ? colors.green : undefined}>
              {reminders === 'granted' ? 'Reminders allowed' : 'Not allowed — you can turn them on later in your phone settings'}
            </Txt>
          </Row>
        )}
      </View>

      <View style={{ gap: 16, paddingHorizontal: 4 }}>
        {[
          ['lock-outline', 'Your data is private. We never sell it or show it to anyone.'],
          ['account-cancel-outline', 'No contacts, location, camera or microphone access. Ever.'],
          ['download-outline', 'Export or permanently delete your data anytime from Profile.'],
        ].map(([icon, text]) => (
          <Row key={text} gap={12} style={{ alignItems: 'flex-start' }}>
            <Icon name={icon!} size={20} color={colors.textMuted} />
            <Txt variant="caption" style={{ flex: 1 }}>{text}</Txt>
          </Row>
        ))}
      </View>

      <View style={{ marginTop: 'auto', gap: 10 }}>
        <Button title={reminders === 'unset' ? 'Continue without reminders' : 'Continue'} onPress={onFinish} />
        <Pressable onPress={() => router.push('/legal/privacy' as Href)} style={{ alignSelf: 'center', padding: 8 }}>
          <Txt variant="caption" color={colors.primary}>Read our Privacy Policy</Txt>
        </Pressable>
      </View>
    </View>
  );
}
