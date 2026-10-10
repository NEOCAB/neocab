import { useState } from 'react';
import type { EndotrachealTube, Line, LineType, TubeVersion } from '../../domain/types';
import { LINE_SIZE_UNIT_SUGGESTIONS, LINE_TYPE_LABELS, LINE_TYPES, TUBE_ROUTE_OPTIONS, optionLabel, tubeDepthLabel } from '../../domain/labels';
import { newLine, newTube, newTubeVersion } from '../../domain/factory';
import { formatNum } from '../../domain/num';
import { compareInstants, formatInstant, nowInstant } from '../../domain/time';
import { currentTube, sortedVersions, tubePlacedAt } from '../../domain/timeline';
import { DateTimeField, NumberField, Section, Segmented, SelectField, TextArea, TextField } from '../fields';
import { useTimeZone } from '../context';
import { useConfirm } from '../confirm';
import type { SectionProps } from './BasicSections';

const LINE_ONLY_TYPES = LINE_TYPES.filter((x): x is Line['type'] => x !== 'endotracheale_tube').map((v) => ({ value: v, label: LINE_TYPE_LABELS[v] }));

function LineCard({ line, onChange, onDelete }: { line: Line; onChange: (l: Line) => void; onDelete: () => void }) {
  return (
    <article className="card" aria-label={LINE_TYPE_LABELS[line.type]}>
      <div className="grid">
        <SelectField label="Type" value={line.type} onChange={(v) => v && onChange({ ...line, type: v })} options={LINE_ONLY_TYPES} emptyLabel={null} />
        <div className="grid two tight">
          <NumberField label="Maat" value={line.size} onChange={(v) => onChange({ ...line, size: v })} rules={{ min: 0 }} />
          <TextField label="Eenheid maat" value={line.sizeUnit} onChange={(v) => onChange({ ...line, sizeUnit: v })} list={LINE_SIZE_UNIT_SUGGESTIONS} />
        </div>
        <NumberField label="Inbrengdiepte (indien van toepassing)" unit="cm" value={line.depthCm} onChange={(v) => onChange({ ...line, depthCm: v })} rules={{ min: 0 }} />
        <TextField label="Locatie" value={line.location} onChange={(v) => onChange({ ...line, location: v })} />
      </div>
      <TextArea label="Tippositie en controle" value={line.tipPosition} onChange={(v) => onChange({ ...line, tipPosition: v })} rows={2} />
      <div className="card-actions end">
        <button type="button" className="link-button danger" onClick={onDelete}>
          {LINE_TYPE_LABELS[line.type]} verwijderen
        </button>
      </div>
    </article>
  );
}

type TubeFormMode = 'plaatsing' | 'aanpassing' | 'correctie';

const FORM_TITLES: Record<TubeFormMode, string> = {
  plaatsing: 'Nieuwe endotracheale tube plaatsen',
  aanpassing: 'Bestaande tube aanpassen',
  correctie: 'Historische correctie',
};

function TubeVersionForm({ mode, initial, onSave, onCancel }: { mode: TubeFormMode; initial: TubeVersion; onSave: (v: TubeVersion) => void; onCancel: () => void }) {
  const [v, setV] = useState<TubeVersion>(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="subform card editor" role="group" aria-label={FORM_TITLES[mode]}>
      <h3>{FORM_TITLES[mode]}</h3>
      {mode === 'correctie' && <p className="notice">U wijzigt een eerder vastgelegde registratie. Meetmomenten op en na dit tijdstip tonen daarna de gecorrigeerde gegevens; de correctie wordt in het verslag vermeld.</p>}
      {mode === 'aanpassing' && <p className="notice">Een aanpassing geldt vanaf het opgegeven tijdstip. Eerdere meetmomenten houden de toen geldende gegevens.</p>}
      <div className="grid">
        <DateTimeField label={mode === 'aanpassing' ? 'Tijdstip aanpassing' : mode === 'plaatsing' ? 'Tijdstip plaatsing' : 'Geldig vanaf'} value={v.validFrom} onChange={(x) => setV({ ...v, validFrom: x })} clearable={false} hint="Standaard nu; terugdateren is mogelijk." />
        <NumberField label="Tubemaat (binnendiameter)" unit="mm" value={v.sizeMm} onChange={(x) => setV({ ...v, sizeMm: x })} rules={{ min: 0 }} />
        <Segmented legend="Route" value={v.route} onChange={(x) => setV({ ...v, route: x })} options={TUBE_ROUTE_OPTIONS} />
        <NumberField label={tubeDepthLabel(v.route).replace(' (cm)', '')} unit="cm" value={v.depthCm} onChange={(x) => setV({ ...v, depthCm: x })} rules={{ min: 0 }} hint={v.route ? undefined : 'Kies de route; het meetpunt (neus of tandenrij) volgt daaruit.'} />
      </div>
      <TextArea label="Tippositie en controle" value={v.tipPosition} onChange={(x) => setV({ ...v, tipPosition: x })} rows={2} />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (!v.validFrom) return setError('Vul het tijdstip in.');
            onSave(v);
          }}
        >
          {mode === 'correctie' ? 'Correctie opslaan' : mode === 'plaatsing' ? 'Tube plaatsen' : 'Aanpassing opslaan'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

function versionText(v: TubeVersion): string {
  return (
    [
      formatNum(v.sizeMm, 'mm') ? `${formatNum(v.sizeMm, 'mm')} ID` : null,
      optionLabel(TUBE_ROUTE_OPTIONS, v.route) || null,
      formatNum(v.depthCm, 'cm') ? `${tubeDepthLabel(v.route).replace(' (cm)', '').toLowerCase()} ${formatNum(v.depthCm, 'cm')}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'gegevens niet ingevuld'
  );
}

function TubeCard({ tube, index, onChange, onDelete }: { tube: EndotrachealTube; index: number; onChange: (t: EndotrachealTube) => void; onDelete: () => void }) {
  const tz = useTimeZone();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ mode: TubeFormMode; version: TubeVersion } | null>(null);
  const versions = sortedVersions(tube);
  const latest = versions[versions.length - 1];
  return (
    <article className="card tube" aria-label={`Endotracheale tube ${index}`}>
      <header className="card-head">
        <div>
          <span className="time">Endotracheale tube</span>
          <span className={`badge ${tube.replacedAt ? 'neutral' : 'ok'}`}>{tube.replacedAt ? `Vervangen ${formatInstant(tube.replacedAt, tz)}` : 'Actueel'}</span>
        </div>
      </header>
      <ol className="tube-history">
        {versions.map((v, i) => (
          <li key={v.id}>
            <div>
              <strong>
                {v.kind === 'plaatsing' ? 'Plaatsing' : 'Aanpassing'} {formatInstant(v.validFrom, tz)}
              </strong>
              {v.correctedAt && <span className="badge neutral">gecorrigeerd {formatInstant(v.correctedAt, tz)}</span>}
              <div>{versionText(v)}</div>
              {v.tipPosition && <div className="muted pre">{v.tipPosition}</div>}
            </div>
            {!form && (
              <div className="card-actions">
                <button type="button" className="link-button" onClick={() => setForm({ mode: 'correctie', version: { ...v } })}>
                  Historische correctie
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    className="link-button danger"
                    onClick={() => {
                      void confirm(`Aanpassing van ${formatInstant(v.validFrom, tz)} verwijderen?`).then((ok) => ok && onChange({ ...tube, versions: tube.versions.filter((x) => x.id !== v.id) }));
                    }}
                  >
                    Verwijderen
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {form && (
        <TubeVersionForm
          mode={form.mode}
          initial={form.version}
          onCancel={() => setForm(null)}
          onSave={(v) => {
            if (form.mode === 'correctie') onChange({ ...tube, versions: tube.versions.map((x) => (x.id === v.id ? { ...v, correctedAt: nowInstant(tz) } : x)) });
            else onChange({ ...tube, versions: [...tube.versions, v] });
            setForm(null);
          }}
        />
      )}
      {!form && (
        <div className="card-actions">
          {!tube.replacedAt && latest && (
            <button type="button" className="secondary" onClick={() => setForm({ mode: 'aanpassing', version: newTubeVersion('aanpassing', { sizeMm: latest.sizeMm, route: latest.route, depthCm: latest.depthCm, tipPosition: latest.tipPosition }, tz) })}>
              Tube aanpassen
            </button>
          )}
          <button type="button" className="link-button danger" onClick={onDelete}>
            Tube verwijderen
          </button>
        </div>
      )}
    </article>
  );
}

export function LinesSection({ t, update }: SectionProps) {
  const tz = useTimeZone();
  const confirm = useConfirm();
  const [newType, setNewType] = useState<LineType>('perifeer_infuus');
  const [placing, setPlacing] = useState<TubeVersion | null>(null);
  const tubes = [...t.tubes].sort((a, b) => compareInstants(tubePlacedAt(a), tubePlacedAt(b)));
  const active = currentTube(t.tubes);
  const setLine = (l: Line) => update((x) => ({ ...x, lines: x.lines.map((y) => (y.id === l.id ? l : y)) }));
  const setTube = (tb: EndotrachealTube) => update((x) => ({ ...x, tubes: x.tubes.map((y) => (y.id === tb.id ? tb : y)) }));

  return (
    <Section id="s10" title="Lijnen, sondes, drains en endotracheale tube">
      <div className="list">
        {t.lines.map((l) => (
          <LineCard
            key={l.id}
            line={l}
            onChange={setLine}
            onDelete={() => {
              void confirm(`${LINE_TYPE_LABELS[l.type]} verwijderen?`).then((ok) => ok && update((x) => ({ ...x, lines: x.lines.filter((y) => y.id !== l.id) })));
            }}
          />
        ))}
        {tubes.map((tb, i) => (
          <TubeCard
            key={tb.id}
            tube={tb}
            index={i + 1}
            onChange={setTube}
            onDelete={() => {
              void confirm('Deze endotracheale tube met de volledige historie verwijderen?').then((ok) => ok && update((x) => ({ ...x, tubes: x.tubes.filter((y) => y.id !== tb.id) })));
            }}
          />
        ))}
      </div>
      {placing ? (
        <>
          {active && <p className="notice">De huidige tube wordt geregistreerd als vervangen op het tijdstip van plaatsing van de nieuwe tube.</p>}
          <TubeVersionForm
            mode="plaatsing"
            initial={placing}
            onCancel={() => setPlacing(null)}
            onSave={(v) => {
              const tube = newTube(tz);
              tube.versions = [{ ...v, kind: 'plaatsing' }];
              update((x) => ({
                ...x,
                tubes: [...x.tubes.map((y) => (active && y.id === active.id ? { ...y, replacedAt: v.validFrom } : y)), tube],
              }));
              setPlacing(null);
            }}
          />
        </>
      ) : (
        <div className="add-row">
          <SelectField label="Type toevoegen" value={newType} onChange={(v) => v && setNewType(v)} options={LINE_TYPES.map((v) => ({ value: v, label: LINE_TYPE_LABELS[v] }))} emptyLabel={null} />
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (newType === 'endotracheale_tube') setPlacing(newTubeVersion('plaatsing', {}, tz));
              else update((x) => ({ ...x, lines: [...x.lines, { ...newLine(), type: newType }] }));
            }}
          >
            {newType === 'endotracheale_tube' ? (active ? 'Nieuwe tube plaatsen' : 'Tube plaatsen') : 'Toevoegen'}
          </button>
        </div>
      )}
      <p className="muted small-print">Tubegegevens worden hier één keer ingevoerd en verschijnen bij invasieve ademhalingsondersteuning op de tijdlijn, met de gegevens die op het tijdstip van het meetmoment golden.</p>
    </Section>
  );
}
