const path = require('path')
// eslint-disable-next-line no-unused-vars
const { Testkit, Utils } = require('aa-testkit')
const { Network } = Testkit({
	TESTDATA_DIR: path.join(__dirname, '../testdata'),
})

describe('Updating decimals', function () {
	this.timeout(120 * 1000)

	before(async () => {
		this.network = await Network.create()
		// this.explorer = await this.network.newObyteExplorer().ready()
		this.genesis = await this.network.getGenesisNode().ready();

		[
			this.deployer,
			this.alice,
		] = await Utils.asyncStartHeadlessWallets(this.network, 2)

		const { unit, error } = await this.genesis.sendBytes({
			toAddress: await this.deployer.getAddress(),
			amount: 1e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		console.error('----- genesis', unit);

		await this.network.witnessUntilStable(unit)

		const balance = await this.deployer.getBalance()
		expect(balance.base.stable).to.be.equal(1e9)
	})

	it('Send bytes to Alice', async () => {
		this.aliceAddress = await this.alice.getAddress()
		const { unit, error } = await this.genesis.sendBytes({
			toAddress: this.aliceAddress,
			amount: 100e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		console.error('---- to Alice', unit);

		await this.network.witnessUntilStable(unit)
		console.error('----- to Alice witnessed');
		const balance = await this.alice.getBalance()
		expect(balance.base.stable).to.be.equal(100e9)
	})


	it('Deploy AA', async () => {
		const { address, unit, error } = await this.deployer.deployAgent(path.join(__dirname, '../token-registry.oscript'))

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		expect(address).to.be.validAddress

		this.aaAddress = address

		await this.network.witnessUntilStable(unit)
	})

	it('Alice defines an asset', async () => {
		const { unit, error } = await this.alice.createAsset({
			cap: 1e15,
			is_private: false,
			is_transferrable: true,
			auto_destroy: false,
			fixed_denominations: false,
			issued_by_definer_only: true,
			cosigned_by_definer: false,
			spender_attested: false,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		this.asset = unit
		console.error('---- asset', this.asset);

		await this.network.witnessUntilStable(unit)
	})

	it('Alice registers a symbol for the asset', async () => {
		const symbol = 'USDC'
		const amount = 0.1e9
		const decimals = 6
		const description = 'USDC coin'
		const drawer_key = this.aliceAddress + '_' + 0 + '_' + symbol + '_' + this.asset

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				symbol: symbol,
				asset: this.asset,
				decimals: decimals,
				description: description,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response.responseVars.message).to.be.equal("Your description is now the current")
		expect(response.response.responseVars[symbol]).to.be.equal(this.asset)
		expect(response.response.responseVars[this.asset]).to.be.equal(symbol)
		expect(response.response.responseVars[drawer_key]).to.be.equal(amount)

		const { vars } = await this.alice.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset)
		expect(vars[drawer_key]).to.be.equal(amount+'')

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })
		const dataPayload = unitObj.messages.find(m => m.app === 'data').payload
		expect(dataPayload.asset).to.be.equal(this.asset)
		expect(dataPayload.name).to.be.equal(symbol)
		expect(dataPayload.decimals).to.be.equal(decimals)

	})

	it('Alice updates decimals for the asset', async () => {
		const symbol = 'USDC'
		const amount = 1e4
		const decimals = 5
		const description = 'USDC coin'

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				symbol: symbol,
				decimals: decimals,
				description: description,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response.responseVars.message).to.be.equal("Your description is now the current")

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })
		const dataPayload = unitObj.messages.find(m => m.app === 'data').payload
		expect(dataPayload.asset).to.be.equal(this.asset)
		expect(dataPayload.name).to.be.equal(symbol)
		expect(dataPayload.decimals).to.be.equal(decimals)

	})

	it('Alice withdraws all', async () => {
		const symbol = 'USDC'
		const amount = 0.1e9
		const drawer_key = this.aliceAddress + '_' + 0 + '_' + symbol + '_' + this.asset

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e4,
			data: {
				withdraw: 1,
				amount: amount,
				symbol: symbol,
				asset: this.asset,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		const { vars } = await this.alice.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset)
		expect(vars[drawer_key]).to.be.equal('0')
		expect(vars['balance_' + this.aliceAddress + '_' + this.asset]).to.be.equal('0')

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })
		const paymentMessage = unitObj.messages.find(m => m.app === 'payment')
		const payout = paymentMessage.payload.outputs.find(out => out.address === this.aliceAddress)
		expect(payout.amount).to.be.equal(amount)

	})


	after(async () => {
		// uncomment this line to pause test execution to get time for Obyte DAG explorer inspection
		// await Utils.sleep(3600 * 1000)
		await this.network.stop()
	})
})
