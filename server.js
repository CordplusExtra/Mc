const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const GoalFollow = goals.GoalFollow
const GoalBlock = goals.GoalBlock
const collectBlock = require('mineflayer-collectblock').plugin
const vec3 = require('vec3')

const bot = mineflayer.createBot({
  host: 'gregsAlone.aternos.me',
  port: 39052,
  username: 'titebot',
  version: '1.20'
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)

let followPlayer = null
let mcData
let collectionUser = null

bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)
})

function lookAtNearestPlayer () {
  const playerFilter = (entity) => entity.type === 'player'
  const playerEntity = bot.nearestEntity(playerFilter)
  if (!playerEntity) return
  const pos = playerEntity.position.offset(0, playerEntity.height, 0)
  bot.lookAt(pos)
}

function followNearestPlayer () {
  if (!followPlayer) return
  const player = bot.players[followPlayer]
  if (!player || !player.entity) {
    bot.chat("I can't see you!")
    return
  }
  const movements = new Movements(bot, mcData)
  movements.scafoldingBlocks = []
  bot.pathfinder.setMovements(movements)
  const goal = new GoalFollow(player.entity, 1)
  bot.pathfinder.setGoal(goal, true)
}

function returnToUser() {
  if (!collectionUser) return
  const player = bot.players[collectionUser]
  if (!player || !player.entity) {
    bot.chat("I can't see you to return!")
    return
  }
  const goal = new GoalBlock(player.entity.position.x, player.entity.position.y, player.entity.position.z)
  bot.pathfinder.setGoal(goal)
}

async function collectBlocksTask(username, blockType, count) {
  collectionUser = username
  
  // Check if the bot has a pickaxe
  const pickaxe = bot.inventory.items().find(item => item.name.includes('pickaxe'))
  if (!pickaxe) {
    bot.chat("I don't have a pickaxe!")
    return
  }

  const blocks = bot.findBlocks({
    matching: blockType.id,
    maxDistance: 64,
    count: count
  })

  if (blocks.length === 0) {
    bot.chat("I don't see that block nearby.")
    return
  }

  const targets = []
  for (let i = 0; i < Math.min(blocks.length, count); i++) {
    targets.push(bot.blockAt(blocks[i]))
  }

  bot.chat(`Found ${targets.length} ${blockType.name}(s)`)

  try {
    await bot.collectBlock.collect(targets, {
      ignoreNoPath: true,
      beforeCollect: () => {
        // Check if pickaxe is about to break
        if (pickaxe.durabilityUsed >= pickaxe.maxDurability - 5) {
          throw new Error('Pickaxe is about to break!')
        }
        // Check if inventory is full
        if (bot.inventory.emptySlotCount() === 0) {
          throw new Error('Inventory is full!')
        }
      }
    })
    bot.chat('Done collecting blocks!')
  } catch (err) {
    bot.chat(err.message)
    console.log(err)
    returnToUser()
  }
}

bot.on('chat', async (username, message) => {
  console.log(`Received chat message from ${username}: ${message}`)
  const args = message.split(' ')

  if (args[0] === 'come') {
    console.log(`Attempting to follow ${username}`)
    const player = bot.players[username]
    if (!player) {
      bot.chat(`I can't see ${username}!`)
      console.log(`Player ${username} not found in bot.players`)
      return
    }
    bot.chat(`Following ${username}...`)
    followPlayer = username
    followNearestPlayer()
  } else if (args[0] === 'stop') {
    bot.chat("Stopping follow.")
    followPlayer = null
    bot.pathfinder.setGoal(null)
  } else if (args[0] === 'list' && args[1] === 'players') {
    const playerList = Object.keys(bot.players).join(', ')
    bot.chat(`Players I can see: ${playerList}`)
    console.log(`Players: ${playerList}`)
  } else if (args[0] === 'collect') {
    let count = 1
    if (args.length === 3) count = parseInt(args[1])
    let type = args[1]
    if (args.length === 3) type = args[2]
    const blockType = mcData.blocksByName[type]
    if (!blockType) {
      bot.chat(`I don't know any block named ${type}`)
      return
    }
    await collectBlocksTask(username, blockType, count)
  }
})

bot.on('playerJoined', (player) => {
  console.log(`Player joined: ${player.username}`)
})

bot.on('physicTick', lookAtNearestPlayer)
