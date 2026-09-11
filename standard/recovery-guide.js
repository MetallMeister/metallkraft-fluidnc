export function recoveryView({ state, code, alarmCode, errorCode, intent }) {
  const view = (title, text, action = '') => ({ title, text, action });
  if (!state || state === '?') return intent ? view('通信を確認してください', '状態を受信するまで操作せず、接続を確認してください。') : null;
  if (state === 'ConfigAlarm') return view('設定の確認が必要です', '設定画面と下のログでエラーを確認してください。解除だけでは直りません。');
  if (['Alarm', 'Critical'].includes(state) && Number(alarmCode) === 16) return view('基板の再起動が必要です', '右のログを確認し、機械の安全を確保して基板を再起動。再発時は操作を止めてください。');
  if (state === 'Critical' || (state === 'Alarm' && [1, 2, 13].includes(Number(alarmCode)))) {
    return view('原因を取り除いてください', '右のアラーム内容を確認し、安全を確保して上の「リセット」。再発時は操作を止めてください。', 'reset');
  }
  if (state === 'Sleep') return view('スリープから戻すには', '上の「リセット」を押してください。復帰後は原点・工具位置を再確認します。', 'reset');
  if (state === 'Door') return view('クイック停止・安全扉停止中', '安全確認 → 上の「リセット」で加工中止 → 原点確認・ファイル再選択。途中再開ではありません。', 'reset');
  if (state === 'Alarm' && Number(alarmCode) === 14) return view('機械原点が未確定です', '障害物を確認し、「全軸を機械原点へ復帰」を押します。軸が動くので周囲を空けてください。', 'home');
  if (state === 'Alarm') return view('アラーム解除の前に', '右のログで原因を確認 → 上の「アラーム解除」→ 原点・工具位置を再確認してください。', 'unlock');
  if (state === 'Hold') return code === '0'
    ? view('一時停止中です', '工具と材料の状態を確認して、上の「再開」で続きを実行します。', 'resume')
    : view('停止完了を待っています', '停止完了の案内に変わるまで、そのままお待ちください。');
  if (state === 'Error' || Number(errorCode) > 0) return view('エラーを確認してください', 'ログで原因を確認してください。解消するまでは加工を開始しないでください。');
  if (state === 'Idle' && intent) return view('運転を始める前に', '実際の停止、原点・工具位置・固定を確認して、加工ファイルを選び直してください。');
  if (intent && ['Run', 'Jog'].includes(state)) return view('停止指令の反映待ち', '停止を確認できていません。止まらない場合は機械の非常停止を使用してください。');
  return null;
}

// Observe UI intent and native machine state only; never send or intercept commands.
export function createRecoveryGuide(hooks, jsx, useMachine) {
  return function RecoveryGuide() {
    const { status = {}, alarmCode, errorCode } = useMachine();
    const [intent, setIntent] = hooks.eJ(null);
    const [dismissed, setDismissed] = hooks.eJ('');
    const previousState = hooks.sO(status.state);
    hooks.d4(() => {
      if (status.state === 'Run' && previousState.current !== 'Run') setIntent(null);
      else if (status.state === 'Sleep') setIntent('sleep');
      else if (status.state === 'Door') setIntent('quickstop');
      previousState.current = status.state;
    }, [status.state]);
    hooks.d4(() => {
      const observe = event => {
        const button = event.target?.closest?.('button');
        if (!button || button.matches(':disabled')) return;
        if (button.id === 'btnEStop') { setIntent('quickstop'); setDismissed(''); }
        else if (button.closest('#statusPanel') && button.dataset.tooltip === 'スリープ') { setIntent('sleep'); setDismissed(''); }
        else if (button.id === 'mk-start-job' || button.id === 'btnHAll' || button.closest('#statusPanel') && button.dataset.tooltip === '再開') { setIntent(null); setDismissed(''); }
      };
      document.addEventListener('click', observe, true);
      return () => document.removeEventListener('click', observe, true);
    }, []);
    const view = recoveryView({ ...status, alarmCode, errorCode, intent });
    const key = JSON.stringify([status.state, status.code, alarmCode, errorCode, intent, view]);
    if (!view || dismissed === key) return null;
    return jsx('aside', {
      id: 'mk-recovery-guide', 'data-next-action': view.action, role: 'status', 'aria-live': 'polite',
      children: [
        jsx('div', { class: 'mk-recovery-heading', children: [
          jsx('strong', { children: view.title }),
          jsx('button', { type: 'button', class: 'btn btn-clear do-not-disable', 'aria-label': '案内を閉じる', onClick: () => setDismissed(key) }),
        ] }),
        jsx('p', { children: view.text }),
      ],
    });
  };
}
