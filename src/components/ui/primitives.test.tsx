import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Badge, Button, Checkbox, Dialog, DialogContent, DialogTrigger, EmptyState, Field, Input, Pagination, SegmentedControl, Surface, Switch } from './primitives';

describe('Rinspace primitives', () => {
  it('announces pending and disables repeat submission', () => {
    render(<Button pending>保存</Button>);
    const button = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('composes a multi-part link through the button slot', () => {
    render(<Button asChild><a href="/write"><span aria-hidden="true">+</span>写作</a></Button>);
    expect(screen.getByRole('link', { name: '写作' }).getAttribute('href')).toBe('/write');
  });

  it('connects field labels, help, errors and invalid state', () => {
    render(<Field label="标题" help="最多 80 字" error="标题不能为空">{({ inputId, descriptionId, errorId }) => <Input id={inputId} aria-describedby={`${descriptionId} ${errorId}`} aria-invalid />}</Field>);
    const input = screen.getByLabelText('标题');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    expect(screen.getByRole('alert').textContent).toBe('标题不能为空');
  });

  it('operates checkbox and switch from the keyboard', async () => {
    const user = userEvent.setup();
    render(<><Checkbox label="订阅" /><Switch label="公开" /></>);
    await user.tab(); await user.keyboard(' ');
    expect(screen.getByRole('checkbox', { name: '订阅' }).getAttribute('data-state')).toBe('checked');
    await user.tab(); await user.keyboard(' ');
    expect(screen.getByRole('switch', { name: '公开' }).getAttribute('data-state')).toBe('checked');
  });

  it('traps dialog focus and restores it to the trigger', async () => {
    const user = userEvent.setup();
    function Fixture() { const [open, setOpen] = useState(false); return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button>打开</Button></DialogTrigger><DialogContent title="确认操作"><Button>继续</Button></DialogContent></Dialog>; }
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: '打开' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('uses the standard icon-only dialog close control', async () => {
    const user = userEvent.setup();
    function Fixture() { const [open, setOpen] = useState(false); return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button>打开</Button></DialogTrigger><DialogContent title="确认操作"><Button>继续</Button></DialogContent></Dialog>; }
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: '打开' });
    await user.click(trigger);
    const close = screen.getByRole('button', { name: '关闭' });
    expect(close.classList.contains('rin-ui-dialog-close')).toBe(true);
    expect(close.textContent).toBe('');
    await user.click(close);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('disables pagination boundaries', () => {
    render(<Pagination page={1} pageCount={3} onPageChange={vi.fn()} />);
    expect((screen.getByRole('button', { name: '上一页' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('第 1 / 3 页').getAttribute('aria-live')).toBe('polite');
  });

  it('exposes semantic admin status primitives without page-owned styling', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Surface><Badge tone="warning">暂缓</Badge><EmptyState title="没有待处理案件" /><SegmentedControl label="案件状态" value="active" items={[{ value: 'active', label: '待处理' }, { value: 'closed', label: '已处理' }]} onValueChange={onChange} /></Surface>);
    expect(screen.getByText('暂缓').getAttribute('data-tone')).toBe('warning');
    expect(screen.getByRole('status').textContent).toBe('没有待处理案件');
    await user.click(screen.getByRole('button', { name: '已处理' }));
    expect(onChange).toHaveBeenCalledWith('closed');
  });
});
