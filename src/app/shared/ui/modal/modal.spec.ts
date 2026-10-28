import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';
import { Dialog } from 'primeng/dialog';
import { describe, expect, it } from 'vitest';

import { Modal } from './modal';

describe('Modal', () => {
  it('creates', () => {
    TestBed.configureTestingModule({ providers: [providePrimeNG({})] });
    const fixture = TestBed.createComponent(Modal);
    fixture.componentRef.setInput('header', 'Details');
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits close when visibility turns off', () => {
    TestBed.configureTestingModule({ providers: [providePrimeNG({})] });
    const fixture = TestBed.createComponent(Modal);
    const instance = fixture.componentInstance;
    let closed = false;
    instance.close.subscribe(() => (closed = true));

    // Simulate the dialog closing (X / Escape / mask).
    (instance as unknown as { onVisibleChange(v: boolean): void }).onVisibleChange(
      false,
    );
    expect(closed).toBe(true);
    expect(instance.open()).toBe(false);
  });

  it.each([
    [true, 'can be closed by the X, Escape and a backdrop click (V1 default)'],
    [false, 'can only be answered with its own buttons (US-06)'],
  ])('dismissable=%s: %s', (dismissable) => {
    TestBed.configureTestingModule({ providers: [providePrimeNG({})] });
    const fixture = TestBed.createComponent(Modal);
    fixture.componentRef.setInput('dismissable', dismissable);
    fixture.detectChanges();
    const dialog: Dialog = fixture.debugElement.query(By.directive(Dialog)).componentInstance;
    expect(dialog.closable).toBe(dismissable);
    expect(dialog.closeOnEscape).toBe(dismissable);
    expect(dialog.dismissableMask).toBe(dismissable);
  });
});
