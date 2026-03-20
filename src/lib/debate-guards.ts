/** 自发讨论：仅发起人一人在场时的发言与吹哨限制（与席位数据一致） */

export type ProjectSlotsForGuard = {
  hostUserId: string;
  slots: { userId: string | null }[];
};

/** 已加入讨论的真人 userId（发起者 + 各席位，去重） */
export function uniqueParticipantUserIds(project: ProjectSlotsForGuard): string[] {
  const ids = new Set<string>();
  ids.add(project.hostUserId);
  for (const s of project.slots) {
    if (s.userId) ids.add(s.userId);
  }
  return [...ids];
}

/** 是否仅有一个人类参与者（通常只有发起者占席，他人未加入） */
export function isSoloParticipantRoom(project: ProjectSlotsForGuard): boolean {
  return uniqueParticipantUserIds(project).length < 2;
}
