import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig } from 'motion/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AnimateButton, AnimateCheckbox, AnimateIconButton, AnimateProgress, AnimateSidebar, AnimateSidebarContent, AnimateSidebarInset, AnimateSidebarMenu, AnimateSidebarMenuButton, AnimateSidebarMenuItem, AnimateSidebarProvider, AnimateSidebarTrigger, AnimateSwitch, AnimateTabs, AnimateTabsContent, AnimateTabsList, AnimateTabsTrigger } from './index';

describe('owned Animate UI acceptance contract', () => {
  it('keeps names, disabled and pending semantics independent of motion', async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(
      <MotionConfig reducedMotion="always">
        <AnimateButton disabled onClick={action}>
          发布文章
        </AnimateButton>
        <AnimateIconButton icon={<span>+</span>} label="添加标签" />
      </MotionConfig>,
    );
    await user.click(screen.getByRole('button', { name: '发布文章' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '添加标签' }).getAttribute('aria-label')).toBe('添加标签');
  });

  it('moves tabs with keyboard and exposes only the selected panel', async () => {
    const user = userEvent.setup();
    render(
      <AnimateTabs defaultValue="article">
        <AnimateTabsList aria-label="内容类型">
          <AnimateTabsTrigger value="article">文章</AnimateTabsTrigger>
          <AnimateTabsTrigger value="question">问题</AnimateTabsTrigger>
        </AnimateTabsList>
        <AnimateTabsContent value="article">文章列表</AnimateTabsContent>
        <AnimateTabsContent value="question">问题列表</AnimateTabsContent>
      </AnimateTabs>,
    );
    const article = screen.getByRole('tab', { name: '文章' });
    article.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '问题' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toContain('问题列表');
  });

  it('moves vertical tabs with up and down keys', async () => {
    const user = userEvent.setup();
    render(
      <AnimateTabs defaultValue="pending">
        <AnimateTabsList aria-label="运营工作区" aria-orientation="vertical">
          <AnimateTabsTrigger value="pending">待处理</AnimateTabsTrigger>
          <AnimateTabsTrigger value="content">内容</AnimateTabsTrigger>
        </AnimateTabsList>
      </AnimateTabs>,
    );
    const pending = screen.getByRole('tab', { name: '待处理' });
    pending.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: '内容' }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps checkbox and switch controlled state truthful', () => {
    function Fixture() {
      const [checked, setChecked] = useState(false);
      return (
        <>
          <AnimateCheckbox checked={checked} label="允许评论" onCheckedChange={(value) => setChecked(value === true)} />
          <AnimateSwitch checked={checked} label="公开发布" onCheckedChange={setChecked} />
        </>
      );
    }
    render(<Fixture />);
    fireEvent.click(screen.getByRole('checkbox', { name: '允许评论' }));
    expect(screen.getByRole('checkbox', { name: '允许评论' }).getAttribute('data-state')).toBe('checked');
    expect(screen.getByRole('switch', { name: '公开发布' }).getAttribute('data-state')).toBe('checked');
  });

  it('announces progress while animation stays presentation-only', () => {
    render(<AnimateProgress label="上传进度" max={20} value={13} />);
    expect(screen.getByText('上传进度：65%')).toBeTruthy();
  });

  it('keeps the sidebar accessible while its desktop rail collapses', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AnimateSidebarProvider storageKey="rinspace-sidebar-test" navigationName="管理">
        <AnimateSidebar label="创作导航">
          <AnimateSidebarTrigger />
          <AnimateSidebarContent>
            <AnimateSidebarMenu>
              <AnimateSidebarMenuItem>
                <AnimateSidebarMenuButton isActive>内容管理</AnimateSidebarMenuButton>
              </AnimateSidebarMenuItem>
            </AnimateSidebarMenu>
          </AnimateSidebarContent>
        </AnimateSidebar>
        <AnimateSidebarInset>内容区域</AnimateSidebarInset>
      </AnimateSidebarProvider>,
    );
    expect(screen.getByRole('complementary', { name: '创作导航' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '内容管理' }).getAttribute('aria-current')).toBe('page');
    await user.click(screen.getByRole('button', { name: '收起管理导航' }));
    expect(container.querySelector('.rin-animate-sidebar-provider')?.getAttribute('data-sidebar-state')).toBe('collapsed');
    expect(screen.getByRole('button', { name: '展开管理导航' })).toBeTruthy();
    expect(window.localStorage.getItem('rinspace-sidebar-test')).toBe('false');
  });
});
