/**
 * Share cards: a good-looking image of a win (streak, forest, boss beaten, new level) that members
 * post to WhatsApp / Instagram. The image carries the app's name and link — free word of mouth.
 *
 *   <ShareButton card={{ emoji: '🔥', title: '30-day streak', subtitle: 'Read', stat: '30 days in a row' }} />
 */
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, Share, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useAppConfig } from '@/lib/config';
import { gradients } from '@/theme';
import { Button, Gradient, haptic, Icon, Sheen, Txt } from './ui';

export interface ShareCardData {
  emoji: string;
  title: string;
  subtitle?: string;
  /** One big line, e.g. "32 trees grown" */
  stat?: string;
  colors?: readonly [string, string];
}

/** The picture itself (square, so it looks right in stories and chats). */
function Card({ card, link }: { card: ShareCardData; link: string }) {
  return (
    <Gradient colors={card.colors ?? gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 320, height: 320, borderRadius: 32, padding: 26, justifyContent: 'space-between', overflow: 'hidden' }}>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <Txt style={{ fontSize: 70, lineHeight: 82 }}>{card.emoji}</Txt>
        <Txt variant="title" center style={{ fontSize: 26, lineHeight: 31 }}>{card.title}</Txt>
        {card.stat ? <Txt variant="h2" center style={{ opacity: 0.95 }}>{card.stat}</Txt> : null}
        {card.subtitle ? <Txt variant="caption" center>{card.subtitle}</Txt> : null}
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Txt variant="h3">⚓ Holdfast</Txt>
        <Txt variant="caption" style={{ fontSize: 12 }}>{link || 'Build habits that stick'}</Txt>
      </View>
    </Gradient>
  );
}

export function ShareButton({ card, label = 'Share', small = true }: { card: ShareCardData; label?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const { settings } = useAppConfig();
  const link = settings.play_store_url || settings.website_url;
  const text = `${card.emoji} ${card.title}${card.stat ? ` — ${card.stat}` : ''}. I'm building better habits with Holdfast${link ? `: ${link}` : '.'}`;

  const share = async () => {
    setBusy(true);
    try {
      if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
        // view-shot's types predate this React Native version; the ref is a plain native view
        const uri = await captureRef(ref as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: card.title });
      } else {
        await Share.share({ message: text });
      }
      haptic.success();
      setOpen(false);
    } catch {
      // Picture failed? Share the text instead
      await Share.share({ message: text }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button title={label} icon="share-variant" variant="secondary" small={small} onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
          <Pressable onPress={() => {}}>
            <View ref={ref} collapsable={false} style={{ borderRadius: 32, overflow: 'hidden' }}>
              <Card card={card} link={link} />
              <Sheen every={2500} />
            </View>
          </Pressable>
          <View style={{ width: 320, gap: 10 }}>
            <Button title="Share" icon="share-variant" loading={busy} onPress={share} />
            <Pressable onPress={() => setOpen(false)} style={{ alignItems: 'center', padding: 8 }}>
              <Row>
                <Icon name="close" size={16} color="#FFFFFF" />
                <Txt color="#FFFFFF" style={{ marginLeft: 6 }}>Not now</Txt>
              </Row>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{children}</View>;
}
