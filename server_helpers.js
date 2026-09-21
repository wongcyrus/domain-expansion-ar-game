'use strict';

const crypto = require('crypto');

function parseAwsCredentials(content, profile = 'default') {
    let inTargetProfile = false;
    let accessKeyId = null;
    let secretAccessKey = null;
    let sessionToken = null;

    for (let line of content.split(/\r?\n/)) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) {
            continue;
        }
        if (line.startsWith('[') && line.endsWith(']')) {
            inTargetProfile = line.slice(1, -1).trim() === profile;
            continue;
        }
        if (!inTargetProfile) {
            continue;
        }

        const parts = line.split('=');
        if (parts.length < 2) {
            continue;
        }
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join('=').trim();
        if (key === 'aws_access_key_id') accessKeyId = value;
        if (key === 'aws_secret_access_key') secretAccessKey = value;
        if (key === 'aws_session_token') sessionToken = value;
    }

    return accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey, sessionToken }
        : null;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key, value, encoding) {
    return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = hmac(`AWS4${key}`, dateStamp);
    const kRegion = hmac(kDate, regionName);
    const kService = hmac(kRegion, serviceName);
    return hmac(kService, 'aws4_request');
}

function translateDetail(detail) {
    if (!detail) return '';
    let result = detail;
    const replacements = [
        [/Chimera Shadow Garden/gi, '領域展開「嵌合暗翳庭」（伏黑惠）'],
        [/Authentic Love/gi, '領域展開「真贋相愛」（乙骨憂太）'],
        [/Self-Embodiment of Perfection/gi, '領域展開「自閉円頓裹」（真人）'],
        [/Yuji Itadori's Domain/gi, '領域展開「虎杖悠仁之領域」（虎杖悠仁）'],
        [/Malevolent Shrine/gi, '領域展開「伏魔御廚子」（兩面宿儺）'],
        [/Idle Death Gamble/gi, '領域展開「坐殺博徒」（秤金次）'],
        [/Unlimited Void/gi, '領域展開「無量空處」（五條悟）'],
        [/Time Cell Moon Palace/gi, '領域展開「時胞月宮殿」（禪院直哉）'],
        [/Hollow Purple/gi, '「虛式『茈』」（五條悟）'],
        [/Reversal Red/gi, '「術式反轉『赫』」（五條悟）'],
        [/Lapse Blue/gi, '「術式順轉『蒼』」（五條悟）'],
        [/Only (\d+) seconds remaining in the match! The battle is near its end!/gi, '對戰只剩返 $1 秒！戰局即將結束！'],
        [/The scores are tied! Both players are neck and neck at (\d+)!/gi, '比分打成平手！雙方依家以 $1 比 $1 叮噹馬頭，勢均力敵！'],
        [/(Player 1|Player 2) successfully activated/gi, '$1 成功發動'],
        [/(Player 1|Player 2) has taken the lead!/gi, '$1 攞到領先優勢！'],
        [/(Player 1|Player 2) scored!/gi, '$1 成功得分！'],
        [/Player 1/gi, 'P1'],
        [/Player 2/gi, 'P2'],
    ];
    for (const [pattern, replacement] of replacements) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

function cleanCommentary(commentary) {
    return commentary
        .replace(/\[([a-zA-Z0-9_-]+)\]/g, '')
        .replace(/[\*_`~]/g, '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolveTechniqueTargets(robotId, role) {
    if (robotId !== 'all') {
        return [robotId || 'robot_1'];
    }
    if (role === 'player1') return ['robot_1', 'robot_2', 'robot_3'];
    if (role === 'player2') return ['robot_4', 'robot_5', 'robot_6'];
    return ['robot_1'];
}

const TECHNIQUE_TO_MCP_TOOL = Object.freeze({
    domain_unlimited_void: 'robot_kung_fu',
    domain_malevolent_shrine: 'robot_right_uppercut',
    domain_self_embodiment: 'robot_twist',
    domain_authentic_love: 'robot_wave',
    domain_idle_death_gamble: 'robot_dance_one',
    domain_yuji_itadori: 'robot_left_shot_fast',
    domain_chimera_shadow_garden: 'robot_squat',
    domain_time_cell_moon_palace: 'robot_twist',
    lapse_blue: 'robot_left_shot_fast',
    reversal_red: 'robot_right_shot_fast',
    hollow_purple: 'robot_left_kick',
});

module.exports = {
    TECHNIQUE_TO_MCP_TOOL,
    cleanCommentary,
    getSignatureKey,
    hmac,
    parseAwsCredentials,
    resolveTechniqueTargets,
    sha256,
    translateDetail,
};
