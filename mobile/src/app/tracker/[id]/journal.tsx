import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Button, Card, Chip, haptic, Input, Loading, Row, Screen, SectionTitle, ToggleRow, Txt } from '@/components/ui';
import { addDays, longDate } from '@/lib/format';
import { useEntries, useSaveEntry, useToday, useTracker } from '@/lib/queries';
import type { Entry, Tracker } from '@/lib/types';
import { colors } from '@/theme';

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

export default function Journal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tracker } = useTracker(id);
  const { data: entries, isLoading } = useEntries(id, 'month');
  const today = useToday(id);
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const date = day === 'today' ? today : addDays(today, -1);

  if (isLoading || !tracker) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']}>
        <Row gap={8}>
          <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
          <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
        </Row>
        <Txt variant="h2" style={{ marginTop: 14 }}>{longDate(date)}</Txt>
        {/* Keyed by date so the form re-initialises from that day's saved entry */}
        <JournalForm key={date} tracker={tracker} date={date} entry={entries?.find((e) => e.date === date)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function JournalForm({ tracker, date, entry }: { tracker: Tracker; date: string; entry?: Entry }) {
  const save = useSaveEntry(tracker.id);
  const isTrading = tracker.type === 'trading';
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [followedPlan, setFollowedPlan] = useState(entry?.reflection?.followedPlan ?? true);
  const [marketView, setMarketView] = useState(entry?.reflection?.marketView ?? '');
  const [wentWell, setWentWell] = useState(entry?.reflection?.wentWell ?? '');
  const [mistakes, setMistakes] = useState(entry?.reflection?.mistakes ?? '');
  const [lesson, setLesson] = useState(entry?.reflection?.lesson ?? '');
  const [note, setNote] = useState(entry?.note ?? '');

  const submit = () =>
    save.mutate(
      {
        date,
        mood,
        note: note.trim() || null,
        ...(isTrading ? { reflection: { followedPlan, marketView, wentWell, mistakes, lesson } } : {}),
      },
      {
        onSuccess: () => {
          haptic.success();
          router.back();
        },
      },
    );

  return (
    <View>
      <SectionTitle>How was your mind today?</SectionTitle>
      <Row style={{ justifyContent: 'space-between' }}>
        {MOODS.map((m, i) => (
          <Pressable
            key={m}
            onPress={() => {
              haptic.tap();
              setMood(i + 1);
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: mood === i + 1 ? colors.primarySoft : colors.surface,
              borderWidth: 1,
              borderColor: mood === i + 1 ? colors.primary : colors.border,
            }}>
            <Txt style={{ fontSize: 26 }}>{m}</Txt>
          </Pressable>
        ))}
      </Row>

      {isTrading ? (
        <>
          <SectionTitle>Reflection</SectionTitle>
          <Card style={{ marginBottom: 14 }}>
            <ToggleRow label="I followed my plan today" value={followedPlan} onChange={setFollowedPlan} />
          </Card>
          <View style={{ gap: 14 }}>
            <Input label="Market view" value={marketView} onChangeText={setMarketView} multiline placeholder="What was the market doing? Trend, range, news?" />
            <Input label="What went well" value={wentWell} onChangeText={setWentWell} multiline placeholder="Waited for my setup, respected stop-loss…" />
            <Input label="Mistakes" value={mistakes} onChangeText={setMistakes} multiline placeholder="Entered early, moved my stop, took an extra trade…" />
            <Input label="One lesson for tomorrow" value={lesson} onChangeText={setLesson} multiline placeholder="The one thing I will do differently." />
          </View>
        </>
      ) : (
        <>
          <SectionTitle>Note</SectionTitle>
          <Input value={note} onChangeText={setNote} multiline placeholder="Anything worth remembering about today?" />
        </>
      )}

      {save.error ? <Txt color={colors.red} style={{ marginTop: 12 }}>{save.error.message}</Txt> : null}
      <Button title="Save journal" icon="content-save" loading={save.isPending} onPress={submit} style={{ marginTop: 24 }} />
    </View>
  );
}
