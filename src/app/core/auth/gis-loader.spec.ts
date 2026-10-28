import { GIS_SCRIPT_URL, createGisLoader } from './gis-loader';
import { FakeGis } from './testing/fake-gis';

function gisScripts(): HTMLScriptElement[] {
  return [...document.head.querySelectorAll<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`)];
}

describe('createGisLoader', () => {
  afterEach(() => {
    gisScripts().forEach((s) => s.remove());
    delete window.google;
  });

  it('adds the script once and resolves with google.accounts.oauth2 on load', async () => {
    const load = createGisLoader(document);
    const first = load();
    const second = load();
    expect(second).toBe(first);
    expect(gisScripts()).toHaveLength(1);

    const oauth2 = new FakeGis();
    window.google = { accounts: { oauth2 } };
    gisScripts()[0].dispatchEvent(new Event('load'));
    await expect(first).resolves.toBe(oauth2);
  });

  it('rejects when the script fails, and a retry replaces the failed tag', async () => {
    const load = createGisLoader(document);
    const failed = load();
    const failedTag = gisScripts()[0];
    failedTag.dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('failed to load');

    const retry = load();
    expect(retry).not.toBe(failed);
    expect(gisScripts()).toHaveLength(1);
    expect(gisScripts()[0]).not.toBe(failedTag);
  });

  it('rejects when the script loads without google.accounts.oauth2', async () => {
    const pending = createGisLoader(document)();
    gisScripts()[0].dispatchEvent(new Event('load'));
    await expect(pending).rejects.toThrow('without google.accounts.oauth2');
  });
});
