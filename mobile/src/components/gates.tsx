import type { ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { APP_VERSION, compareVersions, refreshConfig, useAppConfig, type Announcement } from '@/lib/config';
import { usePrefs } from '@/lib/prefs';
import { contactSupport } from '@/lib/support';
import { colors, gradients, levelColor } from '@/theme';
import { Button, Gradient, Icon, Row, Screen, Txt } from './ui';

const PLAY_STORE_FALLBACK = 'market://details?id=com.anchor.discipline';

function FullScreen({ icon, title, message, children }: { icon: string; title: string; message: string; children?: ReactNode }) {
  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center', alignItems: 'center', gap: 18 }}>
      <Gradient colors={gradients.primary} style={{ width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={42} />
      </Gradient>
      <Txt variant="title" center>{title}</Txt>
      <Txt variant="caption" center style={{ maxWidth: 320, fontSize: 16, lineHeight: 23 }}>{message}</Txt>
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 12 }}>{children}</View>
    </Screen>
  );
}

/**
 * Admin-controlled gates, checked before the app is shown:
 *  - maintenance mode (staff still get in)
 *  - minimum app version (forces an update)
 */
export function AppGates({ children }: { children: ReactNode }) {
  const { settings, appName } = useAppConfig();
  const isStaff = useAuth((s) => s.user?.isAdmin ?? false);

  if (settings.maintenance_mode && !isStaff)
    return (
      <FullScreen icon="wrench" title="We’ll be right back" message={settings.maintenance_message || `${appName} is being improved. Please check back shortly.`}>
        <Button title="Try again" icon="refresh" onPress={() => void refreshConfig()} />
        {settings.support_email ? <Button title="Contact support" variant="ghost" onPress={() => void contactSupport()} /> : null}
      </FullScreen>
    );

  if (compareVersions(APP_VERSION, settings.min_app_version) < 0)
    return (
      <FullScreen icon="cellphone-arrow-down" title="Update required" message={`This version of ${appName} is no longer supported. Update to keep your streaks and data in sync.`}>
        <Button title="Update now" icon="google-play" onPress={() => void Linking.openURL(settings.play_store_url || PLAY_STORE_FALLBACK)} />
        <Txt variant="caption" center>You have {APP_VERSION} · required {settings.min_app_version}</Txt>
      </FullScreen>
    );

  return <>{children}</>;
}

/** "Update available" (optional) + live announcements from the admin panel. */
export function Banners() {
  const { settings, announcements } = useAppConfig();
  const dismissed = usePrefs((s) => s.dismissedAnnouncements);
  const dismissedUpdate = usePrefs((s) => s.dismissedUpdate);
  const update = usePrefs((s) => s.update);

  const showUpdate = compareVersions(APP_VERSION, settings.latest_app_version) < 0 && dismissedUpdate !== settings.latest_app_version;
  const visible = announcements.filter((a) => !dismissed.includes(a.id));
  if (!showUpdate && !visible.length) return null;

  return (
    <View style={{ gap: 10, marginBottom: 16 }}>
      {showUpdate ? (
        <BannerCard
          a={{ id: 'update', title: `Version ${settings.latest_app_version} is available`, body: 'Update for the latest improvements and fixes.', level: 'info', ctaLabel: 'Update', ctaUrl: settings.play_store_url || PLAY_STORE_FALLBACK }}
          onClose={() => void update({ dismissedUpdate: settings.latest_app_version })}
        />
      ) : null}
      {visible.map((a) => (
        <BannerCard key={a.id} a={a} onClose={() => void update({ dismissedAnnouncements: [...dismissed, a.id] })} />
      ))}
    </View>
  );
}

function BannerCard({ a, onClose }: { a: Announcement; onClose: () => void }) {
  const c = levelColor[a.level] ?? levelColor.info;
  const icon = { danger: 'alert-octagon', warning: 'alert', success: 'party-popper', info: 'bullhorn' }[a.level] ?? 'bullhorn';
  return (
    <View style={{ backgroundColor: c.bg, borderColor: c.fg + '55', borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 }}>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <Icon name={icon} size={20} color={c.fg} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h3" color={c.fg}>{a.title}</Txt>
          {a.body ? <Txt variant="caption" color={colors.text} style={{ opacity: 0.85 }}>{a.body}</Txt> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Icon name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Row>
      {a.ctaLabel && a.ctaUrl ? (
        <Pressable onPress={() => void Linking.openURL(a.ctaUrl!)} style={{ alignSelf: 'flex-start', marginLeft: 30 }} hitSlop={6}>
          <Txt variant="caption" color={c.fg} style={{ fontWeight: '700' }}>{a.ctaLabel} →</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
