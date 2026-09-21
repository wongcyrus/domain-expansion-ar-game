'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    TECHNIQUE_TO_MCP_TOOL,
    cleanCommentary,
    getSignatureKey,
    hmac,
    parseAwsCredentials,
    resolveTechniqueTargets,
    sha256,
    translateDetail,
} = require('../server_helpers');

describe('AWS signing helpers', () => {
    it('parses the selected profile including values containing equals signs', () => {
        const credentials = parseAwsCredentials(`
            [default]
            aws_access_key_id = ignored
            aws_secret_access_key = ignored
            [robot]
            aws_access_key_id = AKID
            aws_secret_access_key = secret=value
            aws_session_token = token
        `, 'robot');
        assert.deepEqual(credentials, {
            accessKeyId: 'AKID',
            secretAccessKey: 'secret=value',
            sessionToken: 'token',
        });
    });

    it('returns null for incomplete or missing profiles', () => {
        assert.equal(parseAwsCredentials('[default]\naws_access_key_id=AKID'), null);
        assert.equal(parseAwsCredentials('[default]\naws_access_key_id=A\naws_secret_access_key=B', 'other'), null);
    });

    it('produces deterministic SHA-256, HMAC, and SigV4 key material', () => {
        assert.equal(
            sha256('abc'),
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
        assert.equal(
            hmac('key', 'The quick brown fox jumps over the lazy dog', 'hex'),
            'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
        );
        assert.equal(
            getSignatureKey(
                'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
                '20120215',
                'us-east-1',
                'iam',
            ).toString('hex'),
            'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d',
        );
    });
});

describe('game bridge helpers', () => {
    it('translates techniques, events, and player names', () => {
        assert.equal(translateDetail(null), '');
        assert.equal(
            translateDetail('Player 1 successfully activated Unlimited Void'),
            'P1 成功發動 領域展開「無量空處」（五條悟）',
        );
        assert.match(
            translateDetail('Only 10 seconds remaining in the match! The battle is near its end!'),
            /10 秒/,
        );
        assert.equal(
            translateDetail('The scores are tied! Both players are neck and neck at 4!'),
            '比分打成平手！雙方依家以 4 比 4 叮噹馬頭，勢均力敵！',
        );
    });

    it('removes commands, markdown, emoji, and excess whitespace from commentary', () => {
        assert.equal(cleanCommentary(' [wave] **Great**  move! 🔥\n`Again` '), 'Great move! Again');
    });

    it('resolves defaults and both player teams', () => {
        assert.deepEqual(resolveTechniqueTargets(undefined, undefined), ['robot_1']);
        assert.deepEqual(resolveTechniqueTargets('robot_9', 'player1'), ['robot_9']);
        assert.deepEqual(resolveTechniqueTargets('all', 'player1'), ['robot_1', 'robot_2', 'robot_3']);
        assert.deepEqual(resolveTechniqueTargets('all', 'player2'), ['robot_4', 'robot_5', 'robot_6']);
        assert.deepEqual(resolveTechniqueTargets('all', 'spectator'), ['robot_1']);
    });

    it('preserves the intentional idle-death-gamble dance-one tool mapping', () => {
        assert.equal(TECHNIQUE_TO_MCP_TOOL.domain_idle_death_gamble, 'robot_dance_one');
    });
});
