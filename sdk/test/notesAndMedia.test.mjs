import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHORTCUTS } from '../../src/main/constants.js';

describe('Hinterland v1.13.0 Features', () => {
  describe('Shortcuts Registry', () => {
    test('registers shortcuts for clearData, notes, togglePiP, and mediaControls', () => {
      assert.equal(DEFAULT_SHORTCUTS.clearData, 'Ctrl+Shift+Delete');
      assert.equal(DEFAULT_SHORTCUTS.notes, 'Ctrl+Shift+Y');
      assert.equal(DEFAULT_SHORTCUTS.togglePiP, 'Ctrl+Shift+X');
      assert.equal(DEFAULT_SHORTCUTS.mediaControls, 'Ctrl+Alt+M');
    });
  });

  describe('Notes Markdown & HTML Sanitization Engine', () => {
    function escapeNoteHtml(text) {
      return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    function formatNoteInline(text) {
      let res = escapeNoteHtml(text);
      res = res.replace(/`([^`]+)`/g, '<code>$1</code>');
      res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      res = res.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" class="noteLink" data-url="$2">$1</a>');
      return res;
    }

    function renderNoteMarkdown(raw) {
      if (!raw || !raw.trim()) return '<p><em>empty</em></p>';
      const lines = raw.split(/\r?\n/);
      const htmlLines = [];
      let inCodeBlock = false;
      let codeBuffer = [];

      for (const line of lines) {
        if (line.trim().startsWith('```')) {
          if (inCodeBlock) {
            htmlLines.push(`<pre><code>${escapeNoteHtml(codeBuffer.join('\n'))}</code></pre>`);
            codeBuffer = [];
            inCodeBlock = false;
          } else {
            inCodeBlock = true;
          }
          continue;
        }
        if (inCodeBlock) {
          codeBuffer.push(line);
          continue;
        }

        if (line.startsWith('# ')) {
          htmlLines.push(`<h1>${formatNoteInline(line.slice(2))}</h1>`);
        } else if (line.startsWith('## ')) {
          htmlLines.push(`<h2>${formatNoteInline(line.slice(3))}</h2>`);
        } else if (line.startsWith('### ')) {
          htmlLines.push(`<h3>${formatNoteInline(line.slice(4))}</h3>`);
        } else if (line.startsWith('- [ ] ') || line.startsWith('* [ ] ')) {
          htmlLines.push(`<div class="noteTodo"><input type="checkbox" disabled /> ${formatNoteInline(line.slice(6))}</div>`);
        } else if (line.startsWith('- [x] ') || line.startsWith('* [x] ') || line.startsWith('- [X] ')) {
          htmlLines.push(`<div class="noteTodo done"><input type="checkbox" checked disabled /> <s>${formatNoteInline(line.slice(6))}</s></div>`);
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          htmlLines.push(`<li>${formatNoteInline(line.slice(2))}</li>`);
        } else if (line.trim() === '') {
          htmlLines.push('<br />');
        } else {
          htmlLines.push(`<p>${formatNoteInline(line)}</p>`);
        }
      }

      if (inCodeBlock && codeBuffer.length) {
        htmlLines.push(`<pre><code>${escapeNoteHtml(codeBuffer.join('\n'))}</code></pre>`);
      }

      return htmlLines.join('');
    }

    test('renders headings, bold, inline code and links safely', () => {
      const markdown = '# Main Heading\n\n**Bold Text** and `inline code` with a [link](https://hinterland.io)';
      const output = renderNoteMarkdown(markdown);
      assert.ok(output.includes('<h1>Main Heading</h1>'));
      assert.ok(output.includes('<strong>Bold Text</strong>'));
      assert.ok(output.includes('<code>inline code</code>'));
      assert.ok(output.includes('<a href="https://hinterland.io" class="noteLink" data-url="https://hinterland.io">link</a>'));
    });

    test('escapes HTML tags and script injections inside notes', () => {
      const dangerous = '# Title\n<script>alert("xss")</script>\n<img src=x onerror=alert(1)>';
      const output = renderNoteMarkdown(dangerous);
      assert.ok(!output.includes('<script>'));
      assert.ok(output.includes('&lt;script&gt;'));
      assert.ok(!output.includes('<img'));
      assert.ok(output.includes('&lt;img src=x onerror=alert(1)&gt;'));
    });

    test('renders todo checklists with checked and unchecked states', () => {
      const todos = '- [ ] Task pending\n- [x] Task finished';
      const output = renderNoteMarkdown(todos);
      assert.ok(output.includes('<div class="noteTodo"><input type="checkbox" disabled /> Task pending</div>'));
      assert.ok(output.includes('<div class="noteTodo done"><input type="checkbox" checked disabled /> <s>Task finished</s></div>'));
    });

    test('renders fenced code blocks', () => {
      const code = '```\nconst x = 42;\nconsole.log(x);\n```';
      const output = renderNoteMarkdown(code);
      assert.ok(output.includes('<pre><code>const x = 42;\nconsole.log(x);</code></pre>'));
    });
  });

  describe('History Timestamp Filter (clearSince)', () => {
    test('clears only entries newer than or equal to timestamp', () => {
      const now = Date.now();
      const hourAgo = now - 3600 * 1000;
      const dayAgo = now - 86400 * 1000;

      let entries = [
        { url: 'https://site1.com', title: 'Site 1', time: now - 60000 }, // 1 min ago
        { url: 'https://site2.com', title: 'Site 2', time: now - 1800000 }, // 30 min ago
        { url: 'https://site3.com', title: 'Site 3', time: now - 7200000 }, // 2 hours ago
        { url: 'https://site4.com', title: 'Site 4', time: now - 172800000 }, // 2 days ago
      ];

      // Clear past hour: should keep items older than hourAgo
      const filteredHour = entries.filter((entry) => (entry.time || 0) < hourAgo);
      assert.equal(filteredHour.length, 2);
      assert.equal(filteredHour[0].url, 'https://site3.com');
      assert.equal(filteredHour[1].url, 'https://site4.com');

      // Clear past day: should keep items older than dayAgo
      const filteredDay = entries.filter((entry) => (entry.time || 0) < dayAgo);
      assert.equal(filteredDay.length, 1);
      assert.equal(filteredDay[0].url, 'https://site4.com');
    });
  });

  describe('Notes State Management', () => {
    test('updates existing notes and adds new notes properly', () => {
      const notes = [
        { id: 'n1', title: 'First note', content: 'Hello', pinned: false, updatedAt: 1000 },
      ];

      // Update existing
      const updatePayload = { id: 'n1', title: 'Updated title', content: 'Updated content', pinned: true };
      const idx = notes.findIndex((n) => n.id === updatePayload.id);
      notes[idx] = { ...notes[idx], ...updatePayload, updatedAt: 2000 };
      assert.equal(notes[0].title, 'Updated title');
      assert.equal(notes[0].pinned, true);
      assert.equal(notes[0].updatedAt, 2000);

      // Add new note
      const newPayload = { id: 'n2', title: 'Second note', content: 'World', pinned: false, updatedAt: 3000 };
      notes.unshift(newPayload);
      assert.equal(notes.length, 2);
      assert.equal(notes[0].id, 'n2');
    });
  });
});
