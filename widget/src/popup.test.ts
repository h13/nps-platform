import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showPopup } from './popup';
import type { SurveyConfig, PopupCallbacks } from './popup';

function makeConfig(overrides: Partial<SurveyConfig> = {}): SurveyConfig {
  return {
    survey_title: 'テストアンケート',
    thanks_message: 'ありがとうございます',
    widget_primary_color: '#2563EB',
    widget_bg_color: '#FFFFFF',
    widget_text_color: '#1F2937',
    questions: [],
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<PopupCallbacks> = {}): PopupCallbacks {
  return {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
}

function getShadow(host: HTMLElement): ShadowRoot {
  const shadow = host.shadowRoot;
  if (!shadow) throw new Error('shadowRoot is null');
  return shadow;
}

describe('showPopup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('appends host element to body with shadow DOM', () => {
    const host = showPopup(makeConfig(), makeCallbacks());
    expect(document.body.contains(host)).toBe(true);
    expect(host.shadowRoot).toBeTruthy();
  });

  it('renders survey title in header', () => {
    const host = showPopup(makeConfig({ survey_title: 'My Survey' }), makeCallbacks());
    const shadow = getShadow(host);
    const h2 = shadow.querySelector('h2');
    expect(h2?.textContent).toBe('My Survey');
  });

  it('sets CSS custom properties for colors', () => {
    const host = showPopup(
      makeConfig({
        widget_primary_color: '#FF0000',
        widget_bg_color: '#000000',
        widget_text_color: '#CCCCCC',
      }),
      makeCallbacks(),
    );
    const shadow = getShadow(host);
    const overlay = shadow.querySelector('.overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--primary')).toBe('#FF0000');
    expect(overlay.style.getPropertyValue('--bg')).toBe('#000000');
    expect(overlay.style.getPropertyValue('--text')).toBe('#CCCCCC');
  });

  it('calls onClose when close button is clicked', () => {
    const callbacks = makeCallbacks();
    const host = showPopup(makeConfig(), callbacks);
    const shadow = getShadow(host);
    const closeBtn = shadow.querySelector('.close-btn') as HTMLButtonElement;
    closeBtn.click();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  describe('nps_score question', () => {
    it('renders 11 score buttons (0-10) with labels', () => {
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'nps',
              type: 'nps_score',
              text: 'How likely?',
              required: true,
              display_order: 1,
              min_label: 'Not at all',
              max_label: 'Very likely',
            },
          ],
        }),
        makeCallbacks(),
      );
      const shadow = getShadow(host);
      const buttons = shadow.querySelectorAll('.score-btn');
      expect(buttons.length).toBe(11);

      // Labels rendered
      const labels = shadow.querySelector('.labels');
      expect(labels).toBeTruthy();
      expect(labels?.children[0].textContent).toBe('Not at all');
      expect(labels?.children[1].textContent).toBe('Very likely');
    });

    it('selects score on click and updates answers', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            { id: 'nps', type: 'nps_score', text: 'Score?', required: true, display_order: 1 },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      const buttons = shadow.querySelectorAll('.score-btn');

      // Click score 8
      (buttons[8] as HTMLButtonElement).click();
      expect(buttons[8].classList.contains('selected')).toBe(true);

      // Submit form to verify answer was stored
      const form = shadow.querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));

      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ nps: 8 });
      });
    });

    it('deselects previous button when new one clicked', () => {
      const host = showPopup(
        makeConfig({
          questions: [
            { id: 'nps', type: 'nps_score', text: 'Score?', required: false, display_order: 1 },
          ],
        }),
        makeCallbacks(),
      );
      const shadow = getShadow(host);
      const buttons = shadow.querySelectorAll('.score-btn');
      (buttons[5] as HTMLButtonElement).click();
      (buttons[9] as HTMLButtonElement).click();
      expect(buttons[5].classList.contains('selected')).toBe(false);
      expect(buttons[9].classList.contains('selected')).toBe(true);
    });

    it('does not render labels when min_label and max_label are absent', () => {
      const host = showPopup(
        makeConfig({
          questions: [
            { id: 'nps', type: 'nps_score', text: 'Score?', required: false, display_order: 1 },
          ],
        }),
        makeCallbacks(),
      );
      const shadow = getShadow(host);
      expect(shadow.querySelector('.labels')).toBeNull();
    });
  });

  describe('rating question', () => {
    it('renders rating buttons with custom range and labels', () => {
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'rating1',
              type: 'rating',
              text: 'Rate',
              required: false,
              display_order: 1,
              min_value: 1,
              max_value: 5,
              min_label: 'Low',
              max_label: 'High',
            },
          ],
        }),
        makeCallbacks(),
      );
      const shadow = getShadow(host);
      const buttons = shadow.querySelectorAll('.rating-btn');
      expect(buttons.length).toBe(5);

      const labels = shadow.querySelector('.labels');
      expect(labels?.children[0].textContent).toBe('Low');
      expect(labels?.children[1].textContent).toBe('High');
    });

    it('selects rating on click', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'r',
              type: 'rating',
              text: 'Rate',
              required: false,
              display_order: 1,
              min_value: 1,
              max_value: 3,
            },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      const buttons = shadow.querySelectorAll('.rating-btn');
      (buttons[2] as HTMLButtonElement).click();
      expect(buttons[2].classList.contains('selected')).toBe(true);

      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ r: 3 });
      });
    });
  });

  describe('free_text question', () => {
    it('captures textarea input', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'comment',
              type: 'free_text',
              text: 'Comments?',
              required: false,
              display_order: 1,
              placeholder: 'Type here',
              max_length: 200,
            },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      const ta = shadow.querySelector('textarea') as HTMLTextAreaElement;
      expect(ta.placeholder).toBe('Type here');
      expect(ta.maxLength).toBe(200);

      ta.value = 'Great service!';
      ta.dispatchEvent(new Event('input'));

      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ comment: 'Great service!' });
      });
    });
  });

  describe('single_select question', () => {
    it('captures select change', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'reason',
              type: 'single_select',
              text: 'Why?',
              required: false,
              display_order: 1,
              options: [
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
              ],
            },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      const sel = shadow.querySelector('select') as HTMLSelectElement;
      // Default option + 2 options
      expect(sel.options.length).toBe(3);

      sel.value = 'b';
      sel.dispatchEvent(new Event('change'));

      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ reason: 'b' });
      });
    });

    it('sets undefined when default option selected', () => {
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'reason',
              type: 'single_select',
              text: 'Why?',
              required: false,
              display_order: 1,
              options: [{ value: 'a', label: 'A' }],
            },
          ],
        }),
        makeCallbacks(),
      );
      const shadow = getShadow(host);
      const sel = shadow.querySelector('select') as HTMLSelectElement;
      sel.value = '';
      sel.dispatchEvent(new Event('change'));
      // No assertion on answers since it's internal; we just verify no error
    });
  });

  describe('multi_select question', () => {
    it('captures checkbox changes', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'features',
              type: 'multi_select',
              text: 'Features?',
              required: false,
              display_order: 1,
              options: [
                { value: 'x', label: 'X' },
                { value: 'y', label: 'Y' },
                { value: 'z', label: 'Z' },
              ],
            },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      const checkboxes = shadow.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      expect(checkboxes.length).toBe(3);

      // Check first and third
      checkboxes[0].checked = true;
      checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
      checkboxes[2].checked = true;
      checkboxes[2].dispatchEvent(new Event('change', { bubbles: true }));

      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ features: ['x', 'z'] });
      });
    });

    it('sets undefined when all unchecked', () => {
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'features',
              type: 'multi_select',
              text: 'Features?',
              required: false,
              display_order: 1,
              options: [{ value: 'x', label: 'X' }],
            },
          ],
        }),
        makeCallbacks(),
      );
      const shadow = getShadow(host);
      const cb = shadow.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      // Check then uncheck
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      // answers[features] should be undefined (no checked boxes)
    });
  });

  describe('radio question', () => {
    it('captures radio change', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'choice',
              type: 'radio',
              text: 'Pick one',
              required: false,
              display_order: 1,
              options: [
                { value: '1', label: 'One' },
                { value: '2', label: 'Two' },
              ],
            },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      const radios = shadow.querySelectorAll<HTMLInputElement>('input[type="radio"]');
      expect(radios.length).toBe(2);

      radios[1].checked = true;
      radios[1].dispatchEvent(new Event('change'));

      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ choice: '2' });
      });
    });
  });

  describe('form validation', () => {
    it('blocks submit when required field is empty', () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            { id: 'nps', type: 'nps_score', text: 'Score?', required: true, display_order: 1 },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

      // Should not call onSubmit
      expect(onSubmit).not.toHaveBeenCalled();

      // Error message visible
      const errEl = shadow.getElementById('err-nps');
      expect(errEl?.classList.contains('visible')).toBe(true);
      expect(errEl?.textContent).toBe('この項目は必須です');
    });

    it('shows error for required multi_select with empty array', () => {
      const host = showPopup(
        makeConfig({
          questions: [
            {
              id: 'features',
              type: 'multi_select',
              text: 'Pick',
              required: true,
              display_order: 1,
              options: [{ value: 'x', label: 'X' }],
            },
          ],
        }),
        makeCallbacks(),
      );
      const shadow = getShadow(host);

      // Check then uncheck to get an empty array value
      const cb = shadow.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));

      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

      const errEl = shadow.getElementById('err-features');
      expect(errEl?.classList.contains('visible')).toBe(true);
    });

    it('clears previous error on re-validation when fixed', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const host = showPopup(
        makeConfig({
          questions: [
            { id: 'nps', type: 'nps_score', text: 'Score?', required: true, display_order: 1 },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);
      const form = shadow.querySelector('form')!;

      // First submit without value → error
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(shadow.getElementById('err-nps')?.classList.contains('visible')).toBe(true);

      // Select a score
      (shadow.querySelectorAll('.score-btn')[7] as HTMLButtonElement).click();

      // Re-submit → error cleared synchronously by validateForm (before async onSubmit)
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      // Check error state immediately (before showThanksScreen replaces DOM)
      expect(shadow.getElementById('err-nps')?.classList.contains('visible')).toBe(false);

      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ nps: 7 });
      });
    });
  });

  describe('form submission', () => {
    it('disables button and shows thanks on success', async () => {
      vi.useFakeTimers();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      const host = showPopup(
        makeConfig({
          questions: [
            { id: 'nps', type: 'nps_score', text: 'Score?', required: true, display_order: 1 },
          ],
        }),
        { onSubmit, onClose },
      );
      const shadow = getShadow(host);

      // Select score
      (shadow.querySelectorAll('.score-btn')[10] as HTMLButtonElement).click();

      // Submit
      const submitBtn = shadow.querySelector('.submit-btn') as HTMLButtonElement;
      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.textContent).toBe('送信中...');

      // Wait for promise resolution
      await vi.waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });

      // Thanks screen shown
      await vi.waitFor(() => {
        const thanks = shadow.querySelector('.thanks');
        expect(thanks).toBeTruthy();
        expect(thanks?.querySelector('p')?.textContent).toBe('ありがとうございます');
      });

      // Auto-close after 2000ms + 300ms fadeOut
      vi.advanceTimersByTime(2000);
      vi.advanceTimersByTime(300);
      expect(onClose).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it('re-enables button on submit failure', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error('Network error'));
      const host = showPopup(
        makeConfig({
          questions: [
            { id: 'nps', type: 'nps_score', text: 'Score?', required: true, display_order: 1 },
          ],
        }),
        makeCallbacks({ onSubmit }),
      );
      const shadow = getShadow(host);

      (shadow.querySelectorAll('.score-btn')[5] as HTMLButtonElement).click();
      shadow.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

      await vi.waitFor(() => {
        const btn = shadow.querySelector('.submit-btn') as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toBe('送信する');
      });
    });
  });

  it('renders required mark on required questions', () => {
    const host = showPopup(
      makeConfig({
        questions: [
          { id: 'nps', type: 'nps_score', text: 'Score?', required: true, display_order: 1 },
          {
            id: 'comment',
            type: 'free_text',
            text: 'Comment',
            required: false,
            display_order: 2,
          },
        ],
      }),
      makeCallbacks(),
    );
    const shadow = getShadow(host);
    const marks = shadow.querySelectorAll('.required-mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('*');
  });

  it('uses default colors when config colors are empty', () => {
    const host = showPopup(
      makeConfig({
        widget_primary_color: '',
        widget_bg_color: '',
        widget_text_color: '',
      }),
      makeCallbacks(),
    );
    const shadow = getShadow(host);
    const overlay = shadow.querySelector('.overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--primary')).toBe('#2563EB');
    expect(overlay.style.getPropertyValue('--bg')).toBe('#FFFFFF');
    expect(overlay.style.getPropertyValue('--text')).toBe('#1F2937');
  });
});
