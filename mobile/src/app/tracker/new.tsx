import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { TrackerForm, type TrackerDraft } from '@/components/TrackerForm';
import { StartWithPack } from '@/components/quickActions';
import { Card, ErrorView, Icon, Row, Screen, SectionTitle, TrackerIcon, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAppConfig } from '@/lib/config';
import { CATEGORIES, categoryOf } from '@/lib/catalog';
import { defaultConfigFor } from '@/lib/defaults';
import { useCreateTracker, useTemplates } from '@/lib/queries';
import type { CategoryKey, Template, TrackerType } from '@/lib/types';
import { colors, radius } from '@/theme';
import { t } from '@/lib/i18n';

function draftFromTemplate(t: Template): TrackerDraft {
  return { type: t.type, category: t.category, name: t.name, icon: t.icon, color: t.color, templateSlug: t.slug, config: defaultConfigFor(t.type, t.config) as TrackerDraft['config'] };
}

const CUSTOM_OPTIONS: Record<CategoryKey, { type: TrackerType; kind?: 'build' | 'quit' | 'limit'; label: string; icon: string }[]> = {
  trading: [{ type: 'trading', label: 'Custom trading plan', icon: 'tune-variant' }],
  money: [
    { type: 'spending', label: 'Custom budget', icon: 'wallet-outline' },
    { type: 'habit', kind: 'build', label: 'Custom money habit', icon: 'plus' },
  ],
  quit: [
    { type: 'habit', kind: 'quit', label: 'Quit something completely', icon: 'cancel' },
    { type: 'habit', kind: 'limit', label: 'Cut down — stay under a limit', icon: 'arrow-collapse-down' },
  ],
  fitness: [{ type: 'habit', kind: 'build', label: 'Custom habit', icon: 'plus' }],
  mind: [{ type: 'habit', kind: 'build', label: 'Custom habit', icon: 'plus' }],
  productivity: [{ type: 'habit', kind: 'build', label: 'Custom habit', icon: 'plus' }],
  other: [
    { type: 'habit', kind: 'build', label: 'Build a habit', icon: 'plus' },
    { type: 'habit', kind: 'quit', label: 'Quit a habit', icon: 'cancel' },
    { type: 'habit', kind: 'limit', label: 'Limit something', icon: 'arrow-collapse-down' },
    { type: 'spending', label: 'Spending budget', icon: 'wallet-outline' },
    { type: 'trading', label: 'Trading plan', icon: 'chart-line' },
  ],
};

export default function NewTracker() {
  const params = useLocalSearchParams<{ category?: string }>();
  const interests = useAuth((s) => s.user?.interests ?? []);
  const [category, setCategory] = useState<CategoryKey | null>((params.category as CategoryKey) || null);
  const [draft, setDraft] = useState<TrackerDraft | null>(null);
  const templates = useTemplates();
  const create = useCreateTracker();
  const { settings } = useAppConfig();
  // Admin feature switches (Admin → App settings → Features)
  const typeAllowed = (type: TrackerType) => (type === 'trading' ? settings.feature_trading : type === 'spending' ? settings.feature_spending : true);

  /* Step 3: configure */
  if (draft) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: t(draft.templateSlug ? 'Make it yours' : 'Create tracker') }} />
        <TrackerForm
          initial={draft}
          submitLabel="Create tracker"
          submitting={create.isPending}
          error={create.error?.message}
          onSubmit={(d) => create.mutate(d, { onSuccess: ({ tracker }) => router.replace(`/tracker/${tracker.id}`) })}
        />
      </Screen>
    );
  }

  /* Step 2: template or custom within a category */
  if (category) {
    const c = categoryOf(category);
    const list = (templates.data ?? []).filter((t) => t.category === category && typeAllowed(t.type));
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: t(c.label) }} />
        <Pressable onPress={() => setCategory(null)} style={{ marginBottom: 8 }} hitSlop={8}>
          <Row gap={4}>
            <Icon name="chevron-left" size={18} color={colors.primary} />
            <Txt variant="caption" color={colors.primary}>All categories</Txt>
          </Row>
        </Pressable>
        <Txt variant="caption">Start from a template — you can change every limit on the next screen.</Txt>

        {templates.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} /> : null}
        {templates.isError ? (
          <View style={{ marginTop: 20 }}>
            <ErrorView error={templates.error} onRetry={() => templates.refetch()} />
          </View>
        ) : null}
        {list.length ? <SectionTitle>Templates</SectionTitle> : null}
        <View style={{ gap: 10 }}>
          {list.map((t) => (
            <Card key={t.slug} onPress={() => setDraft(draftFromTemplate(t))}>
              <Row gap={14}>
                <TrackerIcon icon={t.icon} color={t.color} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="h3">{t.name}</Txt>
                  <Txt variant="caption">{t.subtitle}</Txt>
                </View>
                <Icon name="chevron-right" color={colors.textDim} />
              </Row>
            </Card>
          ))}
        </View>

        <SectionTitle>Or build your own</SectionTitle>
        <View style={{ gap: 10 }}>
          {CUSTOM_OPTIONS[category].filter((o) => typeAllowed(o.type)).map((o) => (
            <Card
              key={o.label}
              onPress={() =>
                setDraft({
                  type: o.type,
                  category,
                  name: '',
                  icon: o.type === 'trading' ? 'chart-line' : o.type === 'spending' ? 'wallet-outline' : c.icon,
                  color: c.color,
                  config: defaultConfigFor(o.type, o.kind ? { kind: o.kind, ...(o.kind === 'limit' ? { goalType: 'count', target: 3 } : {}) } : {}) as TrackerDraft['config'],
                })
              }>
              <Row gap={14}>
                <TrackerIcon icon={o.icon} color={colors.textMuted} />
                <Txt variant="h3" style={{ flex: 1 }}>{o.label}</Txt>
                <Icon name="chevron-right" color={colors.textDim} />
              </Row>
            </Card>
          ))}
        </View>
      </Screen>
    );
  }

  /* Step 1: category */
  const ordered = CATEGORIES.filter((c) => c.key !== 'trading' || settings.feature_trading).sort((a, b) => Number(interests.includes(b.key)) - Number(interests.includes(a.key)));
  return (
    <Screen edges={['bottom']}>
      <View style={{ marginTop: -16, marginBottom: 20 }}>
        <StartWithPack />
      </View>
      <Txt variant="h2" style={{ marginBottom: 6 }}>What do you want to track?</Txt>
      <Txt variant="caption" style={{ marginBottom: 20 }}>Choose an area. Every limit is yours to set.</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
        {ordered.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={({ pressed }) => ({
              width: '48.5%',
              minHeight: 132,
              padding: 16,
              gap: 10,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: interests.includes(c.key) ? c.color + '88' : colors.border,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.color + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={c.icon} size={22} color={c.color} />
            </View>
            <Txt variant="h3">{c.label}</Txt>
            <Txt variant="caption" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={2}>{c.description}</Txt>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
