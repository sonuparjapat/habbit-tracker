import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Card, EmptyState, Loading, Row, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { longDate, money, pnlColor } from '@/lib/format';
import { useRuleBreaks } from '@/lib/queries';
import { colors } from '@/theme';

export default function RuleBreaks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useRuleBreaks(id, 'all');
  const currency = useAuth((s) => s.user?.currency ?? 'INR');
  if (isLoading) return <Loading />;

  // Group by day
  const days = new Map<string, NonNullable<typeof data>>();
  for (const b of data ?? []) days.set(b.date, [...(days.get(b.date) ?? []), b]);

  return (
    <Screen edges={['bottom']}>
      <Txt variant="caption" style={{ marginBottom: 16 }}>
        Every rule you broke, with the reason you gave at the time. Read it before you trade.
      </Txt>
      {!data?.length ? (
        <EmptyState icon="shield-check" title="No rule breaks" message="Not a single one. Keep it that way." />
      ) : null}
      <View style={{ gap: 12 }}>
        {[...days.entries()].map(([date, list]) => (
          <Card key={date} style={{ gap: 12 }}>
            <Txt variant="h3">{longDate(date)}</Txt>
            {list.map((b) => (
              <View key={b.id} style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: colors.red, paddingLeft: 12 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="h3" color={colors.red}>{b.label}</Txt>
                  {b.tradeNet != null ? (
                    <Txt variant="mono" color={pnlColor(b.tradeNet, colors)}>{money(b.tradeNet, currency, { sign: true })}</Txt>
                  ) : null}
                </Row>
                <Txt variant="caption">{b.description}</Txt>
                {b.reason ? <Txt style={{ fontStyle: 'italic', marginTop: 2 }}>“{b.reason}”</Txt> : null}
              </View>
            ))}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
