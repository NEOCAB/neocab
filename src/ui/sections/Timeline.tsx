import { chem } from '../chem';
import { useEffect, useRef, useState } from 'react';
import type { EndotrachealTube, Measurement, RespMode } from '../../domain/types';
import { GAS_FIELDS, GAS_TYPE_OPTIONS, INVASIVE_MODES, MONITOR_FIELDS, NON_INVASIVE_MODES, RESP_MODE_LABELS, isInvasive, respFieldsFor, type NumFieldDef } from '../../domain/labels';
import { newMeasurement } from '../../domain/factory';
import { compareInstants, formatInstant } from '../../domain/time';
import { sortedMeasurements, tubeAt, upsertMeasurement } from '../../domain/timeline';
import { timelineReportTable, tubeSummary } from '../../report/buildReport';
import { DataTable, TimeStamp } from '../DataTable';
import { OI_FORMULA, formatOi, oxygenationIndex } from '../../domain/oi';
import { DateTimeField, NumberField, Section, Segmented, TextArea } from '../fields';
import { AddIcon, EditIcon, ViewIcon } from '../icons';
import { TimelineCharts } from '../TimelineCharts';
import { formatNum, formatNumber } from '../../domain/num';
import { useTimeZone } from '../context';
import { useConfirm } from '../confirm';
import type { SectionProps } from './BasicSections';

/** Label met eventueel de volledige naam klein en grijs erachter ("MAP Gem. bloeddruk"). */
const labelOf = (d: NumFieldDef) => (d.full ? <>{d.label}{' '}<span className="label-full">{d.full}</span></> : d.label);
const rulesOf = (d: NumFieldDef) => ({ min: d.min, max: d.max, integer: d.integer });

/** Oxygenatie-index van het meetmoment in bewerking (alleen berekend, zonder beoordeling). */
function OiLine({ m }: { m: Measurement }) {
  const oi = oxygenationIndex(m);
  if (oi === null) return null;
  return (
    <p className="oi-line" role="status" title={OI_FORMULA}>
      Oxygenatie-index (OI): {formatOi(oi)}
    </p>
  );
}

function ModePicker({ value, onChange }: { value: RespMode | ''; onChange: (m: RespMode | '') => void }) {
  const groups: { title: string; modes: RespMode[] }[] = [
    { title: 'Geen', modes: ['geen'] },
    { title: 'Non-invasief', modes: NON_INVASIVE_MODES },
    { title: 'Invasief', modes: INVASIVE_MODES },
  ];
  return (
    <fieldset className="segmented mode-picker">
      <legend className="field-label sr-only">Ademhalingsondersteuning</legend>
      {groups.map((g) => (
        <div className="mode-group" key={g.title} role="group" aria-label={g.title}>
          {g.title !== 'Geen' && <span className="mode-group-title">{g.title}</span>}
          <div className="segmented-options">
            {g.modes.map((m) => (
              <label key={m} className={`seg ${value === m ? 'checked' : ''}`}>
                <input type="radio" name="resp-mode" value={m} checked={value === m} onChange={() => onChange(m)} onClick={value === m ? () => onChange('') : undefined} />
                <span>{RESP_MODE_LABELS[m]}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

type TabId = 'adem' | 'monitor' | 'gas' | 'beleid';
const TABS: { id: TabId; label: string }[] = [
  { id: 'adem', label: 'Ademhaling' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'gas', label: 'Bloedgas' },
  { id: 'beleid', label: 'Beleid' },
];

function MeasurementEditor({
  draft,
  setDraft,
  tubes,
  measurements,
  isNew,
  proposed,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Measurement;
  setDraft: (m: Measurement) => void;
  tubes: EndotrachealTube[];
  measurements: Measurement[];
  isNew: boolean;
  proposed: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const tz = useTimeZone();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Op een telefoon niet meteen het toetsenbord openen.
    if (window.matchMedia?.('(pointer: fine)').matches) ref.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, []);
  const mode = draft.resp.mode;
  const settings = mode ? (draft.resp.settingsByMode[mode] ?? {}) : {};
  const tube = mode && isInvasive(mode) ? tubeAt(tubes, draft.at) : null;
  const setSetting = (key: string, v: import('../../domain/types').Num) => {
    if (!mode) return;
    setDraft({
      ...draft,
      resp: {
        ...draft.resp,
        settingsByMode: {
          ...draft.resp.settingsByMode,
          [mode]: { ...settings, [key]: v },
        },
      },
    });
  };
  const [tab, setTab] = useState<TabId>('adem');
  // Vorige meting (vóór dit tijdstip), voor de hint "vorige 35" onder een veld.
  const prev = sortedMeasurements(measurements)
    .filter((m) => m.id !== draft.id && compareInstants(m.at, draft.at) <= 0)
    .pop();
  const previousHint = (v: import('../../domain/types').Num) => (typeof v === 'number' ? <span className="prev-value">vorige {formatNumber(v)}</span> : undefined);
  const filledTab: Record<TabId, boolean> = {
    adem: !!mode && (mode === 'geen' || Object.values(settings).some((v) => v !== null && v !== undefined)),
    monitor: Object.values(draft.monitor).some((v) => v !== null),
    gas: draft.gas.type !== '' || Object.values(draft.gas.values).some((v) => v !== null),
    beleid: (draft.policyChanges ?? '').trim() !== '',
  };
  return (
    <form
      ref={ref}
      className="card editor"
      data-tab={tab}
      aria-label={isNew ? 'Nieuw meetmoment' : 'Meetmoment bewerken'}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h3>{isNew ? 'Nieuw meetmoment' : 'Meetmoment bewerken'}</h3>
      <div className="grid">
        <DateTimeField label="Datum en tijd" value={draft.at} onChange={(v) => setDraft({ ...draft, at: v })} clearable={false} />
      </div>

      <div className="tabs" role="tablist" aria-label="Onderdelen van het meetmoment">
        {TABS.map((tb, i) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            id={`mt-${tb.id}`}
            aria-selected={tab === tb.id}
            aria-controls={`mp-${tb.id}`}
            tabIndex={tab === tb.id ? 0 : -1}
            className={tab === tb.id ? 'on' : ''}
            onClick={() => setTab(tb.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
              setTab(next);
              document.getElementById(`mt-${next}`)?.focus();
            }}
          >
            {tb.label}
            {filledTab[tb.id] && <span className="tab-dot" title="Ingevuld" aria-label=" (ingevuld)" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="mp-adem" aria-labelledby="mt-adem" hidden={tab !== 'adem'} className="tab-panel">
        {proposed && mode && (
          <p className="notice" role="status">
            Modaliteit en instellingen zijn als voorstel overgenomen van het vorige meetmoment. Controleer ze; ze worden pas vastgelegd bij Opslaan.
          </p>
        )}
        <ModePicker value={mode} onChange={(m) => setDraft({ ...draft, resp: { ...draft.resp, mode: m } })} />
        {mode && mode !== 'geen' && (
          <div className="grid compact" key={mode}>
            {respFieldsFor(mode).map((f) => {
              const before = prev && prev.resp.mode === mode ? (prev.resp.settingsByMode[mode]?.[f.key] ?? null) : null;
              return <NumberField key={`${mode}-${f.key}`} label={f.label} unit={f.unit} value={settings[f.key] ?? null} onChange={(v) => setSetting(f.key, v)} rules={rulesOf(f)} hint={previousHint(before)} />;
            })}
          </div>
        )}
        {mode === 'geen' && <p className="muted">Geen ademhalingsinstellingen.</p>}
        {mode && isInvasive(mode) && (
          <p className="tube-line">
            <strong>Endotracheale tube op dit tijdstip:</strong> {tube ? tubeSummary(tube.version, tz) : 'geen tube geregistreerd. Voer de tube in bij Ingebrachte materialen.'}
          </p>
        )}
      </div>

      <div role="tabpanel" id="mp-monitor" aria-labelledby="mt-monitor" hidden={tab !== 'monitor'} className="tab-panel">
        <div className="grid compact">
          {MONITOR_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={labelOf(f)}
              unit={f.unit}
              value={draft.monitor[f.key]}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  monitor: { ...draft.monitor, [f.key]: v },
                })
              }
              rules={rulesOf(f)}
              hint={previousHint(prev?.monitor[f.key] ?? null)}
            />
          ))}
        </div>
      </div>

      <div role="tabpanel" id="mp-gas" aria-labelledby="mt-gas" hidden={tab !== 'gas'} className="tab-panel">
        <div className="grid">
          <Segmented legend="Afnametype" value={draft.gas.type} onChange={(v) => setDraft({ ...draft, gas: { ...draft.gas, type: v } })} options={GAS_TYPE_OPTIONS} />
        </div>
        <div className="grid compact">
          {GAS_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              unit={f.unit}
              value={draft.gas.values[f.key]}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  gas: {
                    ...draft.gas,
                    values: { ...draft.gas.values, [f.key]: v },
                  },
                })
              }
              rules={rulesOf(f)}
              hint={previousHint(prev?.gas.values[f.key] ?? null)}
            />
          ))}
        </div>
        <OiLine m={draft} />
      </div>

      <div role="tabpanel" id="mp-beleid" aria-labelledby="mt-beleid" hidden={tab !== 'beleid'} className="tab-panel">
        <TextArea label="Beleidsaanpassingen" value={draft.policyChanges ?? ''} onChange={(v) => setDraft({ ...draft, policyChanges: v })} rows={3} className="policy-field" />
      </div>

      <div className="editor-actions">
        <button type="submit" className="primary">
          Meetmoment opslaan
        </button>
        {tab !== 'beleid' && (
          <button type="button" className="secondary next-tab" onClick={() => setTab(TABS[TABS.findIndex((x) => x.id === tab) + 1].id)}>
            Volgende ›
          </button>
        )}
        <button type="button" className="secondary" onClick={onCancel}>
          Annuleren
        </button>
        {onDelete && (
          <button type="button" className="link-button danger" onClick={onDelete}>
            Verwijderen
          </button>
        )}
      </div>
    </form>
  );
}

type View = 'lijst' | 'tabel' | 'grafiek';
const VIEW_KEY = 'neocab:tijdlijn-weergave';
const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'lijst', label: 'Lijst' },
  { value: 'tabel', label: 'Tabel' },
  { value: 'grafiek', label: 'Grafiek' },
];
const VIEW_TITLES: Record<View, string> = { lijst: 'Als lijst weergeven', tabel: 'Als tabel weergeven', grafiek: 'Als grafiek weergeven' };

/** Compacte lijst voor onderweg: nieuwste bovenaan, één regel ademhaling en één regel waarden; tikken opent het meetmoment. */
/** Heel korte weergave voor in de lijst: modaliteit met hooguit drie instellingen (FiO₂, drukken). */
function respShort(m: Measurement): string {
  const mode = m.resp.mode;
  if (!mode) return '';
  const settings = m.resp.settingsByMode[mode] ?? {};
  const order = ['fio2', 'o2', 'flow', 'pip', 'peep', 'map'];
  const parts = respFieldsFor(mode)
    .filter((f) => order.includes(f.key) && formatNum(settings[f.key] ?? null, f.unit) !== null)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .slice(0, 3)
    .map((f) => `${f.label.replace(/\s*\(.*\)$/, '')} ${formatNum(settings[f.key] ?? null, f.unit)}`);
  return [RESP_MODE_LABELS[mode], ...parts].join(' · ');
}

function MeasurementList({ measurements, onPick, editingId }: { measurements: Measurement[]; onPick: (m: Measurement) => void; editingId?: string }) {
  const tz = useTimeZone();
  const items = [...sortedMeasurements(measurements)].reverse();
  const values = (m: Measurement) =>
    [
      formatNum(m.monitor.heartRate, '') && `HF ${formatNum(m.monitor.heartRate, '')}`,
      formatNum(m.monitor.spo2Pre, '%') && `SpO₂ ${formatNum(m.monitor.spo2Pre, '%')}`,
      formatNum(m.monitor.meanBp, '') && `MAP ${formatNum(m.monitor.meanBp, '')}`,
      formatNum(m.monitor.temperature, '°C') && `T ${formatNum(m.monitor.temperature, '°C')}`,
      formatNum(m.gas.values.ph, '') && `pH ${formatNum(m.gas.values.ph, '')}`,
    ].filter(Boolean) as string[];
  return (
    <ul className="m-list" aria-label="Meetmomenten, nieuwste bovenaan">
      {items.map((m) => {
        const wall = formatInstant(m.at, tz);
        const [date, time] = wall ? [wall.slice(0, 10), wall.slice(11, 16)] : ['', '—'];
        const vals = values(m);
        return (
          <li key={m.id}>
            <button type="button" className={`m-row ${editingId === m.id ? 'editing' : ''}`} aria-label={`Meetmoment van ${wall || 'onbekend tijdstip'} bewerken`} onClick={() => onPick(m)}>
              <span className="m-time">
                <strong>{time}</strong>
                <span>{date}</span>
              </span>
              <span className="m-body">
                <span className="m-main">{chem(respShort(m)) || <span className="muted">Geen ademhalingsgegevens</span>}</span>
                {vals.length > 0 && <span className="m-sub">{chem(vals.join(' · '))}</span>}
                {(m.policyChanges ?? '').trim() && <span className="m-sub m-note">{m.policyChanges.trim()}</span>}
              </span>
              <span className="m-edit" aria-hidden="true">
                Bewerken
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Weergavekeuze rechts naast de kop: knoppen met icoon (radiogroep, één is altijd gekozen). */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="view-switch" role="radiogroup" aria-label="Weergave tijdlijn">
      {VIEW_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={view === o.value}
          className={view === o.value ? 'checked' : ''}
          title={VIEW_TITLES[o.value]}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const i = VIEW_OPTIONS.findIndex((x) => x.value === view);
              const next = VIEW_OPTIONS[(i + (e.key === 'ArrowRight' ? 1 : VIEW_OPTIONS.length - 1)) % VIEW_OPTIONS.length].value;
              onChange(next);
              (e.currentTarget.parentElement?.querySelectorAll('button')[VIEW_OPTIONS.findIndex((x) => x.value === next)] as HTMLElement | undefined)?.focus();
            }
          }}
          tabIndex={view === o.value ? 0 : -1}
        >
          <ViewIcon view={o.value} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Gekozen weergave onthouden op dit apparaat (alleen gemak; zonder opslag is de lijst de standaard). */
function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'grafiek' || v === 'tabel' ? v : 'lijst';
    } catch {
      return 'lijst';
    }
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* alleen voor deze sessie */
      }
    },
  ];
}

export function TimelineSection({ t, update }: SectionProps) {
  const tz = useTimeZone();
  const [view, setView] = useView();
  const [draft, setDraft] = useState<Measurement | null>(null);
  const [isNew, setIsNew] = useState(false);
  const confirm = useConfirm();
  const { table, rows } = timelineReportTable(t.measurements, tz);

  const startNew = () => {
    setDraft(newMeasurement(t.measurements, tz));
    setIsNew(true);
  };
  // Sneltoets Alt+M: nieuw meetmoment (toetsenbord, bijv. op een laptop).
  const shortcutRef = useRef<() => void>(() => {});
  shortcutRef.current = () => {
    if (!draft) startNew();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyM') {
        e.preventDefault();
        shortcutRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const save = () => {
    if (!draft) return;
    update((x) => ({
      ...x,
      measurements: upsertMeasurement(x.measurements, draft),
    }));
    setDraft(null);
  };
  const remove = async (m: Measurement) => {
    if (await confirm(`Meetmoment van ${formatInstant(m.at, tz) || 'onbekend tijdstip'} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) {
      update((x) => ({
        ...x,
        measurements: x.measurements.filter((y) => y.id !== m.id),
      }));
      setDraft(null);
    }
  };

  return (
    <Section
      id="s6"
      title="Tijdlijn"
      intro="Ademhalingsondersteuning, monitorgegevens en bloedgassen"
      actions={
        <>
          {t.measurements.length > 0 && <ViewSwitch view={view} onChange={setView} />}
        </>
      }
    >
      {!draft && (
        <button type="button" className="primary timeline-now" onClick={startNew} title="Nieuw meetmoment met de huidige tijd (Alt+M)" aria-keyshortcuts="Alt+M">
          <AddIcon />
          Meetmoment
        </button>
      )}
      {draft && (
        <MeasurementEditor
          key={draft.id}
          draft={draft}
          setDraft={setDraft}
          tubes={t.tubes}
          measurements={t.measurements}
          isNew={isNew}
          proposed={isNew && !!draft.resp.mode}
          onSave={save}
          onCancel={() => setDraft(null)}
          onDelete={isNew ? undefined : () => void remove(draft)}
        />
      )}
      {rows.length === 0 ? (
        !draft && <p className="muted">Nog geen meetmomenten.</p>
      ) : (
        <>
          {view === 'lijst' ? (
            <MeasurementList
              measurements={t.measurements}
              editingId={draft && !isNew ? draft.id : undefined}
              onPick={(m) => {
                setDraft(structuredClone(m));
                setIsNew(false);
              }}
            />
          ) : view === 'grafiek' ? (
            <TimelineCharts
              measurements={t.measurements}
              timeZone={tz}
              onPick={(m) => {
                setDraft(structuredClone(m));
                setIsNew(false);
              }}
            />
          ) : (
            <DataTable
              table={table}
              caption="Tijdlijn: één rij per meetmoment"
              rowClassName={(r) => (draft && !isNew && draft.id === rows[r].id ? 'editing' : '')}
              renderKeyCell={(r, v) => (
                <button
                  type="button"
                  className="row-edit"
                  aria-label={`Meetmoment van ${formatInstant(rows[r].at, tz) || 'onbekend tijdstip'} bewerken`}
                  onClick={() => {
                    setDraft(structuredClone(rows[r]));
                    setIsNew(false);
                  }}
                >
                  <TimeStamp value={v} />
                  <span className="edit-icon"><EditIcon /></span>
                </button>
              )}
            />
          )}
        </>
      )}
    </Section>
  );
}
