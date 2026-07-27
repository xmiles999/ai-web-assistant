const CONTENT_SCRIPT_FILE = 'content-script.js';

export async function injectIntoOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => injectTabIfEligible(tab)));
}

export async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [CONTENT_SCRIPT_FILE],
    });
    return true;
  } catch {
    // Chrome 内部页、商店页、PDF 或用户禁用站点访问时不能注入。
    return false;
  }
}

async function injectTabIfEligible(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !isEligibleUrl(tab.url)) return;
  await injectContentScript(tab.id);
}

function isEligibleUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
