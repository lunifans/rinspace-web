import { useBootstrap } from './context';
import type { RuntimePorts } from '@/platform/runtime';

export function useRuntimePorts(): RuntimePorts {
  return useBootstrap().ports;
}
