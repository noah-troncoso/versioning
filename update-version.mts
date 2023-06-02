import Client, { connect } from '@dagger.io/dagger';
import { resolve } from 'path';

/**
 * Update version in package.json/package-lock.json using the format yyyy.mm.dd-ss
 * Note: seconds are hyphonated so that this still technically matches semver.
 * */

const {
	NPM_REGISTRY,
	ARTIFACTORY_READ_TOKEN,
	GIT_USER,
	GIT_TOKEN,
} = process.env;

if (!NPM_REGISTRY) {
	throw new Error('NPM_REGISTRY is not defined');
}
if (!ARTIFACTORY_READ_TOKEN) {
	throw new Error('ARTIFACTORY_READ_TOKEN is not defined');
}

if (!GIT_USER) {
	throw new Error('GIT_USER is not defined');
}

if (!GIT_TOKEN) {
	throw new Error('GIT_TOKEN is not defined');
}

function generateVersion() {
	const date = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}));
	const [year, month, day] = date.toISOString().split('T')[0].split('-');
	const midnight = new Date(Number(year), Number(month) - 1, Number(day));
	const seconds = (date.getTime() - midnight.getTime()) / 1000;
	return `${year}.${month}.${day}-${seconds}`;
}

function generateNpmrc() {
	return `
		registry=https:${NPM_REGISTRY}
		${NPM_REGISTRY}/:_authToken=${ARTIFACTORY_READ_TOKEN}
	    always-auth=true`;
}

// initialize Dagger client
connect(
  	async (client: Client) => {
		// These are all the files that will be copied into the container
		const source = client
			.host()
			.directory(resolve('./'), { include: [
				'package.json',
				'package-lock.json',
				'.git'
			]})
			.withNewFile('.npmrc', generateNpmrc());

		const node = client.container().from('node:16-alpine');

		const version = generateVersion();

		const runner = node
			.withMountedDirectory('/app', source)
			.withWorkdir('/app')
			.withExec(['npm', 'version', version, '--no-git-tag'])
			.withExec(['git', 'config', 'user.email', 'github.actions@underarmour.com'])
			.withExec(['git', 'config', 'user.name', 'GitHub Actions'])
			.withExec(['git', 'config', '--unset', 'http.https://github.com/.extraheader'])
			.withExec(['git', 'remote', 'set-url', 'origin', `https://${GIT_USER}:${GIT_TOKEN}@github.com/ua-digital-commerce/ua-commerce-api.git`])
			.withExec(['git', 'add', 'package.json', 'package-lock.json'])
			// --no-verify skips pre-commit hooks
			.withExec(['git', 'commit', '--no-verify', '-m', `Updating version to ${version} [skip ci]`])
			.withExec(['git', 'tag', version]);
			// .withExec(['git', 'push', '--atomic', 'origin', 'HEAD:main']);

		console.log('Version updated to ', version);
  	},
  	{ LogOutput: process.stdout },
)

