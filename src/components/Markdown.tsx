import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';

marked.setOptions({ gfm: true, breaks: true });

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const rendered = marked.parse(text, { async: false });
    const clean = DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['style'],
    });
    const document = new DOMParser().parseFromString(clean, 'text/html');
    for (const link of document.querySelectorAll('a')) {
      const protocol = new URL(link.href, location.href).protocol;
      if (!['http:', 'https:', 'mailto:'].includes(protocol)) link.removeAttribute('href');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    return document.body.innerHTML;
  }, [text]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
