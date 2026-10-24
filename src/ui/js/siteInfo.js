import { el, hostOf } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { openPopup, closePopup, isOpen, separator, section } from './popup.js';
import { currentTab } from './state.js';
import { toast } from './toast.js';

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
        card.append(
          separator(),
          section('siteInfo.protectionsHeader'),
          el('div', { class: 'siteInfoProtectionRow' }, [
            el('span', { class: 'siteInfoProtectionIcon', html: icon('shield') }),
            el('span', { class: 'siteInfoProtectionText', text: t('siteInfo.shieldTracking') }),
            el('span', { class: 'statusTag active', text: t('siteInfo.active') }),
          ]),
          el('div', { class: 'siteInfoProtectionRow' }, [
            el('span', { class: 'siteInfoProtectionIcon', html: icon('globe') }),
            el('span', { class: 'siteInfoProtectionText', text: t('siteInfo.shieldHttps') }),
            el('span', { class: 'statusTag active', text: t('siteInfo.active') }),
          ]),
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
