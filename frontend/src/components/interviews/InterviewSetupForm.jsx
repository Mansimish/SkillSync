import { Check, LoaderCircle, ShieldCheck, Video } from 'lucide-react'

const difficulties = [
  { value: 'beginner', label: 'Beginner', description: 'Core concepts and clear fundamentals' },
  { value: 'intermediate', label: 'Intermediate', description: 'Applied decisions and trade-offs' },
  { value: 'advanced', label: 'Advanced', description: 'Depth, edge cases, and system judgment' },
]

const interviewTypes = [
  { value: 'technical', label: 'Technical', description: 'Role-specific knowledge and problem solving' },
  { value: 'behavioral', label: 'Behavioral', description: 'Experiences, collaboration, and judgment' },
  { value: 'resume_based', label: 'Resume-based', description: 'Questions grounded in your uploaded resume' },
  { value: 'mixed', label: 'Mixed', description: 'A balanced interview across multiple areas' },
]

function Choice({ name, option, selected, onChange }) {
  const Icon = option.icon
  return (
    <label className={`relative cursor-pointer rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-indigo-500 ${selected ? 'border-indigo-400 bg-indigo-50/80 dark:border-indigo-700 dark:bg-indigo-950/35' : 'bg-[#fdfdff] hover:border-slate-300 dark:bg-slate-900 dark:hover:border-slate-700'}`}>
      <input className="sr-only" type="radio" name={name} value={option.value} checked={selected} onChange={onChange} />
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 gap-3">{Icon && <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}><Icon size={15} /></span>}<span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span></span></span>
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{selected && <Check size={12} strokeWidth={3} />}</span>
      </span>
    </label>
  )
}

export default function InterviewSetupForm({ form, onChange, onSubmit, isStarting }) {
  const canStart = form.target_role.trim().length >= 2 && !isStarting

  return (
    <form onSubmit={onSubmit} className="rounded-3xl border bg-[#fdfdff] p-5 dark:bg-slate-900 sm:p-7">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><Video size={18} /></span><div><h2 className="font-semibold">Set up your video interview</h2><p className="mt-0.5 text-xs text-slate-500">Five spoken questions by default · finish early after any answer</p></div></div>
      <div className="mt-7"><label htmlFor="target-role" className="text-sm font-semibold">Target role</label><input id="target-role" name="target_role" value={form.target_role} onChange={onChange} maxLength={100} placeholder="e.g. Backend Engineer" className="input-field" autoComplete="organization-title" required /></div>
      <fieldset className="mt-7"><legend className="text-sm font-semibold">Difficulty</legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{difficulties.map((option) => <Choice key={option.value} name="difficulty" option={option} selected={form.difficulty === option.value} onChange={onChange} />)}</div></fieldset>
      <fieldset className="mt-7"><legend className="text-sm font-semibold">Interview type</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{interviewTypes.map((option) => <Choice key={option.value} name="interview_type" option={option} selected={form.interview_type === option.value} onChange={onChange} />)}</div></fieldset>
      <div className="mt-7 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="flex max-w-md items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" />Your recording stays in this browser. Only its transcript and bounded delivery metrics are sent for AI coaching.</p><button className="button-primary min-w-40 gap-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canStart}>{isStarting ? <><LoaderCircle size={16} className="animate-spin" />Checking devices…</> : 'Start video interview'}</button></div>
    </form>
  )
}
