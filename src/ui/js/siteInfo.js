import { el, hostOf } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { openPopup, closePopup, isOpen, separator, section } from './popup.js';
import { currentTab } from './state.js';
import { toast } from './toast.js';
import { openCookieInspector } from './panels.js';

const api = () => window.hinterland;

export function openSiteInfo() {
  if (isOpen('siteinfo')) {
    closePopup();
    return;
  }
  const tab = currentTab();
  if (!tab || !tab.url) return;

  openPopup({
    key: 'siteinfo',
    align: 'left',
    render: (card) => {
      card.classList.add('siteInfoCard');
      const url = tab.url;
      const isInternal = url.startsWith('hinterland://');
      const isSecure = url.startsWith('https://');
      const host = isInternal ? 'Hinterland' : (hostOf(url) || url);

      const badgeType = isSecure ? 'secure' : isInternal ? 'internal' : 'insecure';
      const badgeIcon = isSecure ? 'shield' : isInternal ? 'compass' : 'warning';

      const header = el('div', { class: 'siteInfoHeader' }, [
        el('div', { class: `siteInfoBadge ${badgeType}` }, [
          el('span', { html: icon(badgeIcon) }),
        ]),
        el('div', { class: 'siteInfoTitleGroup' }, [
          el('div', { class: 'siteInfoHost', text: host }),
          el('div', {
            class: `siteInfoStatus ${badgeType}`,
            text: isSecure
              ? t('siteInfo.connectionSecure')
              : isInternal
                ? t('siteInfo.internalPage')
                : t('siteInfo.connectionInsecure'),
          }),
        ]),
      ]);

      const description = el('p', {
        class: 'siteInfoDesc',
        text: isSecure
          ? t('siteInfo.connectionSecureDesc')
          : isInternal
            ? t('siteInfo.internalPageDesc')
            : t('siteInfo.connectionInsecureDesc'),
      });

      card.append(header, description);

      if (!isInternal) {
        // 1. Privacy Shield Card
        const shieldBox = el('div', { class: 'siteInfoShieldBox card', style: { padding: '10px 12px', margin: '8px 0 10px', background: 'var(--surfaceAlt, rgba(255,255,255,0.03))' } });
        card.append(shieldBox);

        api().site.getBlockedTrackers(host).then((trackerData) => {
          shieldBox.replaceChildren();
          const isShieldEnabled = trackerData.enabled !== false;
          const statusPill = el('span', {
            class: `statusTag ${isShieldEnabled ? 'active' : ''}`,
            text: isShieldEnabled ? t('siteInfo.shieldEnabled') : t('siteInfo.shieldDisabled'),
          });

          const toggleButton = el('button', {
            class: 'button small',
            type: 'button',
            style: { marginLeft: 'auto' },
            text: isShieldEnabled ? t('siteInfo.permBlock') : t('siteInfo.permAllow'),
            onclick: async () => {
              const res = await api().site.toggleShield(host);
              toast(res.enabled ? t('toast.shieldEnabled') : t('toast.shieldDisabled'), 'info');
              closePopup();
              api().tab.reload(tab.id);
            },
          });

          const shieldHeaderRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } }, [
            el('span', { class: 'siteInfoProtectionIcon', html: icon('shield') }),
            el('strong', { style: { fontSize: '13px' }, text: t('siteInfo.shieldTitle') }),
            statusPill,
            toggleButton,
          ]);

          const summaryText = el('div', {
            style: { fontSize: '12px', color: 'var(--textDim)' },
            text: trackerData.total > 0
              ? t('siteInfo.trackersBlocked', { count: trackerData.total })
              : t('siteInfo.noTrackersBlocked'),
          });

          shieldBox.append(shieldHeaderRow, summaryText);

          if (isShieldEnabled && trackerData.trackers && trackerData.trackers.length > 0) {
            const listEl = el('div', { style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' } });
            trackerData.trackers.slice(0, 4).forEach((tr) => {
              listEl.append(
                el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--textDim)' } }, [
                  el('span', { text: tr.host }),
                  el('span', { class: 'statusTag', text: `${tr.category} (${tr.count})` }),
                ]),
              );
            });
            shieldBox.append(listEl);
          }
        });

        // 2. Permissions Section
        const permSection = el('div', { class: 'siteInfoPermissions' });
        const permsList = [
          { key: 'camera', labelKey: 'siteInfo.permCamera', iconName: 'camera' },
          { key: 'microphone', labelKey: 'siteInfo.permMicrophone', iconName: 'microphone' },
          { key: 'geolocation', labelKey: 'siteInfo.permLocation', iconName: 'location' },
          { key: 'notifications', labelKey: 'siteInfo.permNotifications', iconName: 'bell' },
          { key: 'clipboardRead', labelKey: 'siteInfo.permClipboard', iconName: 'clipboard' },
        ];

        card.append(
          separator(),
          section('siteInfo.permissionsHeader'),
          permSection,
        );

        api().site.getPermissions(url).then((savedPerms) => {
          permSection.replaceChildren();
          for (const item of permsList) {
            const currentVal = savedPerms?.[item.key] || 'default';
            const select = el('select', { class: 'siteInfoPermSelect' }, [
              el('option', { value: 'default', selected: currentVal === 'default' }, [t('siteInfo.permDefault')]),
              el('option', { value: 'allow', selected: currentVal === 'allow' }, [t('siteInfo.permAllow')]),
              el('option', { value: 'deny', selected: currentVal === 'deny' }, [t('siteInfo.permBlock')]),
            ]);

            select.addEventListener('change', async () => {
              await api().site.setPermission(url, item.key, select.value);
              toast(t('toast.permissionUpdated'), 'success');
            });

            const rowNode = el('div', { class: 'siteInfoPermissionRow' }, [
              el('span', { class: 'siteInfoProtectionIcon', html: icon(item.iconName) }),
              el('span', { class: 'siteInfoProtectionText', text: t(item.labelKey) }),
              select,
            ]);
            permSection.append(rowNode);
          }
        });

        // 3. Cookies & Storage Section
        const cookieRow = el('div', {
          class: 'siteInfoProtectionRow',
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' },
        });

        card.append(
          separator(),
          section('siteInfo.cookiesHeader'),
          cookieRow,
        );

        api().site.getStorageStats(url).then((stats) => {
          cookieRow.replaceChildren(
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
              el('span', { class: 'siteInfoProtectionIcon', html: icon('cookie') }),
              el('span', { style: { fontSize: '13px' }, text: t('siteInfo.cookiesCount', { count: stats.cookieCount }) }),
            ]),
            el('button', {
              class: 'button small',
              type: 'button',
              text: t('siteInfo.inspectCookies'),
              onclick: () => {
                closePopup();
                openCookieInspector(url);
              },
            }),
          );
        });

        // 4. Actions Section
        card.append(
          separator(),
          el('div', { class: 'actionRow siteInfoActions' }, [
            el('button', {
              class: 'button',
              type: 'button',
              onclick: async () => {
                await api().site.clearData(url);
                toast(t('toast.siteDataCleared'), 'success');
                closePopup();
              },
            }, [el('span', { html: icon('trash') }), ` ${t('siteInfo.clearData')}`]),
            el('button', {
              class: 'button',
              type: 'button',
              onclick: () => {
                closePopup();
                window.dispatchEvent(new CustomEvent('hinterland:opensettings', { detail: { section: 'privacy' } }));
              },
            }, [el('span', { html: icon('gear') }), ` ${t('siteInfo.privacySettings')}`]),
          ]),
        );
      }
    },
  });
}
