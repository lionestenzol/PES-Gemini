import React, { useState } from 'react';
import { ProofRecord, CommitmentCard } from '../types.js';
import {
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Clock,
  Search,
  FileCheck,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface ProofLedgerViewProps {
  proofs: ProofRecord[];
  onVerifyProof: (cardId: string) => void;
  onSelectCard: (card: CommitmentCard) => void;
  cards: CommitmentCard[];
}

export const ProofLedgerView: React.FC<ProofLedgerViewProps> = ({
  proofs,
  onVerifyProof,
  onSelectCard,
  cards,
}) => {
  const [search, setSearch] = useState('');
  const [filterVerified, setFilterVerified] = useState<'all' | 'verified' | 'pending'>('all');

  const filteredProofs = proofs.filter((p) => {
    const card = cards.find((c) => c.id === p.card_id);
    const cardName = card ? card.name : p.card_name || '';
    const matchText =
      p.card_id.toLowerCase().includes(search.toLowerCase()) ||
      p.result.toLowerCase().includes(search.toLowerCase()) ||
      p.proof_location.toLowerCase().includes(search.toLowerCase()) ||
      cardName.toLowerCase().includes(search.toLowerCase());

    if (!matchText) return false;
    if (filterVerified === 'verified') return p.verified;
    if (filterVerified === 'pending') return !p.verified;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-slate-800" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Proof-of-Completion Ledger & Certification
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              PES rejects untracked assertions of completion. Every commitment moving out of Active must log a concrete result and proof location. Verification confirms proof satisfies the original desired outcome.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
              Verified: {proofs.filter((p) => p.verified).length}
            </span>
            <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
              Pending: {proofs.filter((p) => !p.verified).length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search card ID, result summary, or proof artifact..."
            className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          {(['all', 'pending', 'verified'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterVerified(tab)}
              className={`text-xs px-3 py-1 rounded font-medium transition-colors capitalize ${
                filterVerified === tab
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Proofs Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {filteredProofs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No proof records match current search or filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Card</th>
                  <th className="py-3 px-4">Result Summary</th>
                  <th className="py-3 px-4">Proof Location / Artifact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProofs.map((p) => {
                  const card = cards.find((c) => c.id === p.card_id);
                  const title = card ? card.name : p.card_name || p.card_id;

                  return (
                    <tr key={p.card_id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Card ID & Title */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-slate-900">{p.card_id}</span>
                          <span className="text-[11px] text-slate-600 line-clamp-1">{title}</span>
                        </div>
                      </td>

                      {/* Result */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <p className="text-slate-800 line-clamp-2">{p.result || 'No result text'}</p>
                      </td>

                      {/* Proof Location */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-slate-700 bg-slate-100 px-2 py-1 rounded border border-slate-200 w-fit max-w-full">
                          <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{p.proof_location || 'Not recorded'}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {p.verified ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200">
                            <CheckCircle2 className="w-3 h-3 text-teal-600" />
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Verification</span>
                          </span>
                        )}
                        {p.verified_at && (
                          <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                            {new Date(p.verified_at).toLocaleDateString()}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-2">
                          {!p.verified && (
                            <button
                              onClick={() => onVerifyProof(p.card_id)}
                              className="px-2.5 py-1 rounded text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-2xs"
                            >
                              Verify Proof
                            </button>
                          )}
                          {card && (
                            <button
                              onClick={() => onSelectCard(card)}
                              className="px-2 py-1 rounded text-xs text-slate-600 hover:bg-slate-100 border border-slate-200"
                            >
                              Inspect
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
