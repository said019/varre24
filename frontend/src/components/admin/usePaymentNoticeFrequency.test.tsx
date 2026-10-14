import {render,screen,waitFor,cleanup,act} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {usePaymentNoticeFrequency} from './usePaymentNoticeFrequency';
// @vitest-environment jsdom
import {StrictMode} from 'react';
let now=new Date('2026-10-14T15:00:00Z');
function Probe({allowed=true}:{allowed?:boolean}){const key=usePaymentNoticeFrequency({fecha:'2026-10-15',texto:'Pago'},allowed);return <output>{key}</output>;}
beforeEach(()=>{now=new Date('2026-10-14T15:00:00Z');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);const m=new Map();vi.stubGlobal('localStorage',{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('persists across remount and opens next slot only',async()=>{
 const first=render(<Probe/>);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('morning'));
 first.unmount();render(<Probe/>);await act(async()=>{});expect(screen.getByRole('status').textContent).toBe('');
 vi.setSystemTime(new Date('2026-10-14T18:00:00Z'));await act(async()=>window.dispatchEvent(new Event('focus')));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('afternoon'));
});
it('unauthorized role never claims storage',async()=>{
 const v=render(<Probe allowed={false}/>);await act(async()=>{});expect(screen.getByRole('status').textContent).toBe('');
 v.rerender(<Probe/>);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('morning'));
 v.rerender(<Probe allowed={false}/>);expect(screen.getByRole('status').textContent).toBe('');
});
it('StrictMode initially valid notice still displays exactly once',async()=>{
 render(<StrictMode><Probe/></StrictMode>);
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('morning'));
});
